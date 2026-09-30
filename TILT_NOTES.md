# Tilt inner dev loop: notes

How MiniOpenFX runs under Tilt on a local k3d cluster: save a file, and the running app in Kubernetes updates in about a second, with no manual image rebuild or redeploy.

Measured on 2026-09-30 on a Mac (Apple Silicon, Docker Desktop with 10 CPUs and 8 GB RAM), Tilt v0.37.7, k3d v5.9.0 (k3s v1.35.5).

For the earlier Minikube version of this setup and the Tilt-vs-Okteto comparison, see [docs/tilt-vs-okteto-notes.md](docs/tilt-vs-okteto-notes.md).

## Results

Each test was run 3 times. The table shows the median, with all runs in brackets.

| Test | API (NestJS) | Website (React/Vite) |
|---|---|---|
| **Cold start**: `tilt ci` from nothing deployed until every resource is green (image cache warm) | **23.7s** (28.3 / 22.7 / 23.7), all resources together | same run |
| **One-line code change**, save until the change is visible | **1.39s** (1.39 / 1.12 / 1.53) | **0.31s** (0.73 / 0.31 / 0.29) |
| **Dependency change** (add an npm package), save until running | **2.52s** (2.10 / 2.52 / 7.57) | **0.48s** (0.60 / 0.44 / 0.48) |
| **Same one-line change with `live_update` disabled** (full image rebuild and redeploy) | **9.31s** (10.09 / 9.18 / 9.31) | **2.64s** (3.89 / 2.64 / 2.34) |

With `live_update`, the API loop is about **6.7x faster** than a full rebuild and the website loop about **8.5x faster**.

How each test was measured (script-driven, timed from the file write):
- **API, "visible":** the edit changed the string returned by `GET /`. The clock stopped when `curl localhost:8080/` first returned the new text.
- **Website, "visible":** the edit changed the page heading in `App.tsx`. The clock stopped when the Vite dev server first served the new module, which is what the browser fetches on hot reload. The browser repaint itself wasn't timed.
- **API dependency change:** ran `npm install is-odd --package-lock-only` on the Mac, which edits `package.json` and the lockfile. The clock stopped when the package was installed in the container **and** the Node process had restarted **and** the API answered again.
- **Website dependency change:** same edit on the frontend. The clock stopped when the package was installed in the container. Vite loads packages on demand, so no restart is involved.
- **Cold start:** `tilt down`, then `tilt ci` (which exits once everything is healthy). Image layers were already cached in Docker and the registry, and the Postgres disk is kept on `tilt down`. A true first-ever start on a new machine also pulls base images and runs `npm ci`. That wasn't timed, because it would mean deleting the cluster.
- **No-live_update baseline:** `live_update` was temporarily emptied in the Tiltfile. The log confirmed 12 full image builds and zero live updates during the test. Build and push took only about 1.1s each thanks to layer caching and the local registry. The rest is Kubernetes replacing the Pod and, for the API, Nest compiling from scratch on boot.

## Setup from zero

Everything below is run from the repo root.

```sh
# 1. Install the tools (Homebrew). Tilt is the dev loop; k3d runs Kubernetes (k3s) inside Docker.
brew install tilt k3d

# 2. Create a one-node cluster plus a local image registry on host port 5001.
#    (Not 5000: macOS uses that for AirPlay.) k3d also switches kubectl to the new
#    cluster (context "k3d-openfx-dev") and tells Tilt where the registry is.
k3d cluster create openfx-dev --agents 0 --registry-create openfx-registry:0.0.0.0:5001

# 3. Make sure kubectl points at it (the Tiltfile refuses to run against anything else).
kubectl config use-context k3d-openfx-dev

# 4. Create the namespace, then the Secret from the git-ignored k8s/.env.k8s.
#    Tilt deliberately never manages the Secret. See k8s/README.md for what goes in that file.
kubectl apply -f k8s/namespace.yaml
kubectl create secret generic openfx-secrets -n openfx --from-env-file=k8s/.env.k8s

# 5. Start the dev loop. Press space to open the web UI (http://localhost:10350).
tilt up
```

Once everything is green:
- **API:** http://localhost:8080. `GET /` needs no key; `/v1/*` needs the `X-API-Key` header.
- **Website:** http://localhost:8081. Its `/v1` calls are proxied to the API with the key added server-side.

## The Tiltfile, section by section

**0. Safety checks.**
- Calls `fail()` unless the kube context is `k3d-openfx-dev`, so a shared cluster can never be targeted by mistake.
- Calls `fail()` if the `openfx-secrets` Secret is missing. Without it, every Pod gets stuck in `CreateContainerConfigError`.

**1. Load the manifests.** Reads every `k8s/*.yaml` (skipping anything named `secret`) and patches it **in memory**, so the files in `k8s/` stay exactly as they are for normal deploys:
- **API:** 1 replica, `nest start --watch` instead of `node dist/main.js`, and a higher memory limit (the compiler in watch mode needs about 1Gi).
- **Website:** 1 replica, probes pointed at `/` (Vite has no nginx `/healthz`), and a higher memory limit.
- **Migrate Job:** gets its own image name, `openfx-migrate`. If it shared the API's image, every API live update would also try to update this finished Job's container, which Tilt can't do, so it would rebuild and re-run migrations on every save.
- **Postgres disk:** annotated `tilt.dev/down-policy: keep`, so `tilt down` doesn't delete your data.

**2. API image, with `live_update`.**
- `docker_build` with `Dockerfile.dev`, a one-stage image that keeps the dev tools, runs as root, and defaults to watch mode.
- Tilt pushes to the k3d registry, and only changed layers transfer.
- `only=` limits both which files trigger a build and which files go into the build context.
- `live_update` steps, in the order Tilt requires:
  - `fall_back_on(tsconfig*.json, nest-cli.json)`: build-config changes do a full rebuild.
  - `sync('src', '/app/src')`: Nest's watcher recompiles and restarts.
  - `sync` of `package.json` and the lockfile, then two `run()` steps that fire **only** when those files changed. The first is `npm install --include=dev`. The second writes a timestamp to a container-only file, `src/tilt-restart.ts`, so Nest restarts with the new packages loaded. See problems 4–6 for why it's done this way.

**2b. Migrate Job image.**
- Built from the production `Dockerfile`, so migrations run exactly as they do on Render.
- `only=` narrows its watch to `src/db`, `drizzle/`, the package files and the config files that the Dockerfile copies. An ordinary API edit doesn't re-run migrations.

**3. Website image, with `live_update`.**
- `docker_build` with `frontend/Dockerfile.dev`, which runs **Vite's dev server** on port 8080 instead of nginx.
- `frontend/vite.config.tilt.ts` layers the dev-server settings on top of the normal Vite config. It plays nginx's role, proxying `/v1` to the `openfx-api` Service and adding `X-API-Key` from the `API_KEY` env var (filled from the Secret). No key is ever baked into the JS.
- `live_update` steps:
  - `fall_back_on` for the Vite and tsconfig files.
  - `sync` of `src/`, `public/` and `index.html`.
  - `npm install --include=dev`, only when the package files changed.
- The production `frontend/Dockerfile` (Vite build plus nginx) is untouched.

**4. Resources.**
- **Labels** group the UI rows: `data` (postgres, redis), `backend` (migrate, API) and `frontend`. The namespace and ConfigMap appear under `uncategorized`.
- **`resource_deps`** sets the start order: the migrate Job waits for Postgres, the API waits for the migrate Job and Redis, and the website waits for the API.
- **Port forwards:** 8080 goes to the API and 8081 to the website.

**Language and reload strategy.**
- TypeScript compiles, but both services use a watching dev server (Nest's `--watch` and Vite) rather than rebuilding the image. That is the pattern Tilt's Node.js example uses: sync the source, then `run()` the dependency install on a trigger.
- Tilt's docs recommend the `restart_process` extension (`docker_build_with_restart`) for languages that need a process restart on every change. It isn't needed here, because the watchers restart the app themselves, and restarting the whole process on every sync would throw away the incremental compile.

## Problems hit and how they were fixed

1. **The context check pointed at the wrong cluster.**
   - **Symptom:** `kubectl` pointed at an old k3d cluster (`okteto-local`), while the Tiltfile required `minikube`.
   - **Fix:** created a dedicated `openfx-dev` cluster and changed the check to that context.
2. **`fall_back_on` path error.**
   - **Error:** `fall_back_on paths '…/vite.config.ts' is not a child of any watched filepaths`.
   - **Cause:** `sync`, `fall_back_on` and `trigger` paths are relative to the **Tiltfile**, not the build context. The frontend entries needed a `frontend/` prefix.
   - **Recovery:** Tilt reloaded on save, with no restart needed.
3. **`only=` also limits the build context.**
   - **What happened:** narrowing the migrate image's `only=` to DB files, so API edits stopped rebuilding it, broke its build: `"/tsconfig.json": not found`.
   - **Cause:** `only=` decides both what triggers a build and what files Docker gets. It must still include everything the Dockerfile `COPY`s.
   - **Caught by:** the cold-start runs, where `tilt ci` failed in about 10s.
4. **A dependency change silently deleted the dev tools.**
   - **Symptom:** after a dependency change, nothing recompiled any more.
   - **Cause:** the ConfigMap sets `NODE_ENV=production`, so `npm ci` in the container installed only production dependencies (149 packages instead of 588). That deleted TypeScript and the Nest CLI.
   - **Fix:** `--include=dev`.
5. **`npm ci` broke the running watcher.**
   - **Symptom:** errors like `Cannot find global type 'Array'`, then no recovery.
   - **Cause:** `npm ci` deletes all of `node_modules` first, including TypeScript's own files, while Nest's watcher is still compiling.
   - **Fix:** use `npm install`, which only adds or removes the packages that changed.
6. **`touch` doesn't restart Nest.**
   - **Symptom:** the step meant to restart the app after an install did nothing. The old process kept serving and looked healthy.
   - **Cause:** Nest's watcher ignores a file whose content hasn't changed, whether from `touch` or a same-content rewrite. Both were tested in the container.
   - **Fix:** write a fresh timestamp into a container-only file, `src/tilt-restart.ts`.
7. **Dependency-test false positive.**
   - **What happened:** the first marker package, `ms`, is already a transitive dependency of the API, so "is it installed?" was always true.
   - **Fix:** switched to `is-odd`, which is in neither lockfile.

Problems 4–6 went unnoticed until the dependency-change measurement was run. The one-line-change path worked from the start.

## Limitations and concerns to raise with the team

- **Manual steps remain.** Creating the cluster and the Secret is done by hand, once per machine. `k8s/.env.k8s` has to be shared out of band, because it's git-ignored on purpose.
- **Mac resources.**
  - A k3d node, the registry and the load balancer run as Docker containers, and Docker Desktop's VM is capped at 8 GB here.
  - The dev API needs up to 1Gi (the compiler in watch mode) and the Vite dev server up to 512Mi.
  - On this machine, Minikube and a second, unused k3d cluster (`okteto-local`) were also running. Stopping clusters you don't use matters.
- **Dev isn't prod.**
  - The website runs Vite's dev server in the cluster, not nginx, so the nginx config (`frontend/nginx/default.conf.template`) isn't exercised in the Tilt loop.
  - The API runs from `Dockerfile.dev`, as root, with dev dependencies.
  - Run the normal `k8s/` deploy (see `k8s/README.md`) before trusting a change to those parts.
- **In-container installs drift.**
  - After a dependency change, the container's `node_modules` comes from `npm install` rather than the image's `npm ci`. It can differ slightly, for example in lockfile resolution inside the container.
  - The container's copy of `package-lock.json` isn't synced back to the Mac.
  - **Commit the lockfile you generated on the Mac.** When in doubt, run `tilt trigger openfx-api` to force a full rebuild from the image's clean `npm ci`.
- **Dependency timing depends on the network.** `npm install` fetches from the npm registry, which explains the 7.6s outlier.
- **Hot reload through the port-forward.** Vite's module serving was timed, not an actual browser repaint over the HMR websocket. It's worth a quick manual check on each developer's machine.
- **Scaling to more services and developers.**
  - Every developer runs their own cluster. The Tiltfile hard-codes the context name `k3d-openfx-dev`, so everyone has to create the cluster with that exact name, or the check needs to become configurable.
  - Each new service needs its own `docker_build` and `live_update` block. A service without a watching dev server needs the `restart_process` extension instead.
  - Everything runs on one node, so adding services costs Mac memory directly.
- **Saving the Tiltfile** re-evaluates it. If the build config changed, Tilt rebuilds the affected images.
- **Images pile up** in the local registry and the k3d node over time. `k3d cluster delete openfx-dev` followed by recreating the cluster starts clean, but it deletes the local database.
- **Minikube dropped.** Only k3d is supported now. `okteto.yml` and `docs/tilt-vs-okteto-notes.md` still describe the Minikube setup. The Minikube Tiltfile is in git history (commit `79fcd18`).

## Daily workflow cheat sheet

```sh
tilt up                          # start everything and live-update on save (space = web UI)
tilt down                        # stop and remove what Tilt deployed (keeps the DB disk, namespace, Secret)
tilt logs openfx-api             # logs for one resource (or use the web UI, which splits them per resource)
tilt logs -f                     # follow all logs
tilt trigger openfx-api          # force a FULL image rebuild + redeploy of one resource (same as the UI's refresh button)
tilt get uiresource              # status of every resource, from the terminal
tilt ci                          # start, wait until all green, then exit (good for "does it come up?")
kubectl config use-context k3d-openfx-dev   # if Tilt says the context is wrong
k3d cluster stop openfx-dev      # pause the cluster to free Mac resources (data kept)
k3d cluster start openfx-dev     # resume it
```

`tilt trigger <resource>` is the normal way to force a full rebuild. Editing `Dockerfile.dev` or any `fall_back_on` file also triggers one.
