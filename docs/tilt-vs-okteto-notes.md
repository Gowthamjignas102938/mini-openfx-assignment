# Tilt vs Okteto: my notes

I tried two Kubernetes dev-loop tools on my local Minikube cluster (macOS) with our MiniOpenFX app. The goal was to see which one makes "change code, see it running in the cluster" less painful than what I do today, which is: rebuild the image, `minikube image load`, bump the tag, `kubectl apply`. That takes a couple of minutes each time and I forget a step about half the time.

The app is a NestJS API written in TypeScript (Node 22), plus Postgres, Redis, a migrate Job and a React frontend served by nginx. Everything lives in the `openfx` namespace.

## Before starting (29 Sep, around 12:00)

I spent about 5 minutes looking at the repo first. Two things mattered.

My Minikube runs with the containerd runtime, not docker. I didn't realise this mattered until I read up on Tilt. Tilt usually builds images straight into Minikube's Docker, but that only works with the docker runtime. So I'd need to load images into Minikube myself.

TypeScript is compiled, but Nest has a watch mode that recompiles and restarts on save. So it sits somewhere between "interpreted" and "compiled". I went with syncing the source files into the container and letting `nest start --watch` rebuild there, instead of a full image rebuild on every change.

Neither tool was installed.

## Tilt

### Setup (about 20 minutes, 12:05 to 12:25)

Installing was easy: `brew install tilt`, done in about 11 seconds, version 0.37.7.

Writing the Tiltfile took most of the time. I wanted to leave the files in `k8s/` alone, so the Tiltfile reads them and changes a few things in memory before applying: one replica instead of two, Nest's watch command instead of `node dist/main.js`, and a higher memory limit because the TypeScript compiler in watch mode needs more than 256Mi. I also added a small `Dockerfile.dev` that keeps the dev tools. The real `Dockerfile` stays as it is, because Render builds from it.

It took me four tries to get a clean `tilt up`:

1. I used an argument called `skips_push`, which doesn't exist. The real one is `disable_push`. Tilt stopped right away and pointed at the exact line, so that one was a 30 second fix.
2. The migrate Pod got stuck in `ImagePullBackOff`. This one confused me for a few minutes. Tilt gives the build a temporary tag, and after the build it re-tags the image on my Mac and deploys the new tag. My `minikube image load` had already run by then, so Minikube only had the old tag. Adding `skips_local_docker=True` fixed it, because then Tilt deploys exactly the tag I loaded. This is the containerd thing from above coming back to bite me.
3. I saw a scary `field is immutable` error on the Job. That was because the old Job from `kubectl apply` can't be edited in place. Tilt deleted it and made a new one on its own, so I didn't have to do anything.
4. The sneaky one. My first code change showed up in 2 seconds, which looked great. But when I read the log, the migrate Job was also doing a full image rebuild and re-running migrations on every save. It uses the same image as the API, its container had already exited, and Tilt can't sync files into a stopped container, so it falls back to a rebuild. Nothing broke, so I'd never have noticed if I hadn't read the log. I fixed it by giving the Job its own image name in the Tiltfile, built from the normal production Dockerfile. Now it only rebuilds when DB code or migrations change.

Once the first build was cached, a full `tilt up` took about 25 seconds to get everything green.

### What helped

The Tiltfile is basically Python, so reading and changing it felt normal. I could patch the YAML in a loop instead of copying the manifests.

Tilt reloads the Tiltfile when you save it. I never had to restart `tilt up` while fixing the problems above.

Errors in the Tiltfile itself come with a file and line number. The live update log is very clear too: it lists exactly which files it copied and which container it updated. That's how I caught problem 4.

`tilt down` was fast (1 second) and doesn't delete the namespace by default. I added a `tilt.dev/down-policy: keep` annotation to the Postgres disk, and it worked: after `tilt down` the disk, namespace and Secret were all still there, so my balances survived.

### What was hard

The Minikube containerd runtime. Most Tilt examples assume Minikube runs Docker, so I had to write custom build commands instead of using the simple `docker_build`. If our team all ran the docker runtime, half my problems would not have happened.

Kubernetes errors (like `ImagePullBackOff`) show up as Pod events inside the Tilt log. They're there, but mixed in with Postgres and nginx logs, so I had to grep for them. The web UI (press space) splits them per resource, which is easier.

Every build leaves an image in Minikube. After 20 minutes I had 9 of them. They share layers so it's not as bad as it looks, but it will pile up over a week.

### Speed

- API code change (a `.ts` file) to new response on `localhost:8080`: 1.5 seconds, measured twice. Tilt copies the one file, Nest recompiles in about a second and restarts.
- Website change (full image rebuild + load into Minikube): 10.8 seconds until `localhost:8081` served the new page.
- Before Tilt, the same API change was a couple of minutes of manual steps.

## In between: Postgres broke (12:37 to 12:42)

When I came back to start Okteto, my own `tilt up` was still running and Postgres was in `CrashLoopBackOff`. The log said `PANIC: could not locate a valid checkpoint record`. That means the database files on the disk were damaged. It had last shut down at 12:32. The only thing I'd done around then was Ctrl-C and restart `tilt up`, and Ctrl-C alone doesn't touch any Pods. So I honestly don't know what broke it. My best guess is two Postgres processes briefly running on the same disk, but I couldn't prove that from the logs.

It's only demo data, but I didn't want to lose it. I stopped Tilt, mounted the disk in a throwaway Pod, backed it up to my Mac first, and ran `pg_resetwal`. That fixed it. All 5 balances and my one trade came back and the numbers still added up (USD 10,000 minus 100 = 9,900, and the BTC matched the trade row). It cost me about 5 minutes. I also clicked the refresh button on Postgres in the Tilt UI while it was crashing, which of course did nothing useful.

The lesson for me is that the database lives in the same cluster I'm messing around in. With either tool, I should keep an eye on Postgres after switching, not just on the API.

## Okteto

### Setup (about 5 minutes, 12:42 to 12:47)

`brew install okteto` took 7 seconds, version 3.23.1. No account needed. `okteto context use minikube --namespace openfx` pointed it at my cluster in one go.

Okteto works differently from Tilt. It doesn't build or deploy anything. The app has to be running already (I ran `kubectl apply -f k8s/` again). `okteto up` then takes over the `openfx-api` Deployment: it scales the real one to 0 and starts a copy called `openfx-api-okteto` with a plain `node:22-alpine` image. My repo folder syncs into `/app` in that container, and I get a shell inside it. From there I run `npm ci` once and then `npm run start:dev` myself.

To be fair to Tilt, Okteto was faster to set up partly because I'd already learned things the hard way with Tilt. I already knew the watch mode needs more memory than 256Mi, and I already knew about the containerd problem, which Okteto doesn't have at all because it never builds an image.

From `okteto up` to Nest running took about 70 seconds the first time. That included pulling Okteto's own image and `node:22-alpine`, the first file sync, and `npm ci`.

### What helped

No image builds at all, so the containerd runtime didn't matter. Out of my four Tilt problems, three just don't exist here.

The copy keeps the same labels, env vars, ConfigMap and Secret as the real Deployment. So the Service and the website sent traffic to my dev container without me doing anything. I checked: the Service pointed at only the dev Pod, and the website's `/v1` calls reached it.

Because I start the app myself in the shell, compile errors and crashes show up right there in my terminal, like running it locally. It felt the most like normal local development.

`okteto down` took about 5 seconds and put the original Deployment back with its 2 replicas.

### What was hard

The `.stignore` file matters more than I expected. Our `npm run start:dev` loads `.env` if it exists, and my Mac's `.env` points the database at `localhost`. If that file had synced, the app would have tried to find Postgres in the container itself and failed. The app log printed ".env not found", which is how I knew the ignore file worked. I also had to leave out `node_modules`, because the Mac's copy has macOS binaries that won't run on Linux.

While it starts, `okteto up` only shows a spinner ("Activating your development container..."). If a Pod got stuck, I'd have to go to `kubectl get events` myself to see why. It also printed a warning about a "buildkit connector" falling back to "ingress". That sounds scary but it doesn't matter when you don't build images.

`okteto up` wants a real terminal. I couldn't just run it in the background like `tilt up --stream`.

There's no web UI in the open-source CLI. I went looking for one after using Tilt's, but the Okteto dashboard is part of their paid platform. Everything happens in the terminal. For a demo I'd run `kubectl get pods -n openfx -w` next to it, so people can see the API Pods get swapped for the dev one.

Okteto sends usage analytics by default (there's a `~/.okteto/analytics.json`). You can turn it off with `okteto analytics --disable`. Worth knowing before putting it on everyone's laptop.

`okteto down` leaves the dev container's own disk (`openfx-api-okteto`, 2Gi) behind on purpose, so `node_modules` doesn't have to be installed again next time. `okteto down -v` removes it.

### Speed

- API code change to new response on `localhost:8080`: 3.3 seconds, the same across three tries. The extra time compared to Tilt is Syncthing, which waits about a second to batch file changes before sending them.
- Website change: about 2 seconds, and the page updated without even reloading (the tab I was on stayed selected).

### Adding the website (later the same day)

At first I only set up the API. Later I added a second dev container for the website, `openfx-frontend`. It runs Vite's dev server instead of nginx, and it has its own `frontend/.stignore` so my local `frontend/.env` doesn't sync in. You start it in a second terminal with `okteto up openfx-frontend`, so for the full app you need two Okteto windows open. Tilt does all of it from one.

The tricky part was the API calls. In the cluster, nginx forwards `/v1` to the API and adds the key. Vite doesn't do that, and the browser on my Mac can't reach cluster names like `openfx-api`. So the website's dev container also forwards `localhost:8090` to the `openfx-api` Service, and the browser calls the API there. The key comes from the Secret when starting Vite (`VITE_API_KEY=$API_KEY npm run dev`). That puts the key in the browser's JavaScript, which is fine on my laptop but is not how the real deployment does it.

I changed the header from MiniOpenFX to FXFlow in `frontend/src/App.tsx` and it showed up in the browser in about 2 seconds.

## Comparison

| | Tilt | Okteto |
|---|---|---|
| Setup time (for me) | about 20 min, four fixes | about 5 min, but I'd learned from Tilt first |
| Code change to visible | 1.5 s (API), 10.8 s (website rebuild) | 3.3 s (API), about 2 s (website, no reload) |
| How errors show up | Tiltfile errors with a line number. Build and app logs per resource in the web UI. Pod problems mixed into the logs | App errors in my own shell. Startup problems hidden behind a spinner, I needed `kubectl get events` |
| Works on our office-only cluster | Not tested. Probably, but it builds images, so it would need a registry the cluster can pull from | Not tested. Probably, it only needs kubectl access. The cluster must be able to pull `node:22-alpine` and Okteto's image (or a mirror) |
| Works outside office Wi-Fi | On Minikube, yes. For the office cluster, only with VPN | Same: fine on Minikube, VPN for the office cluster |
| Ease for a new developer | `tilt up` and it runs everything, including the website. But the Tiltfile is a lot to understand if it breaks | Easy to explain ("your code runs in the cluster, here's a shell"), but they have to deploy the app first and start it by hand |

## What I'd pick

For our team I'd pick Tilt, as long as the Tiltfile stays in the repo and someone owns it. Once it worked, one `tilt up` started the whole app, website included, and API changes showed up in 1.5 seconds. It also cleans up after itself. Most of my 20 minutes of setup went on a one-time problem (containerd on my Minikube), and that's solved in the file now, so the next person won't hit it.

Okteto was quicker to get going and felt the most like normal local development. Website changes were actually faster with Okteto than with Tilt, because Vite updates the page in place. But you need one terminal per part of the app, the app has to be deployed some other way first, and forgetting about `.stignore` can quietly point the app at the wrong database.

Whichever we use, never run both at the same time. They both take over the same `openfx-api` Deployment and would undo each other's changes.
