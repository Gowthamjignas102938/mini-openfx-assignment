# Tiltfile for MiniOpenFX on a local k3d cluster (with a local image registry).
#
# Run from the repo root:   tilt up      (press space to open the web UI)
# Stop and clean up:        tilt down
#
# This file is Starlark, a small Python-like language. Tilt runs it top to
# bottom on start, and again whenever you save it.
#
# What it does:
#   1. builds three images and pushes them to the k3d registry (localhost:5001):
#      the API (openfx, dev image), the migrate Job (openfx-migrate,
#      production image) and the website (openfx-frontend)
#   2. applies every manifest in k8s/ (never the secret template)
#   3. port-forwards the API to localhost:8080 and the website to localhost:8081
#   4. live-updates the API and the website: a changed source file is copied
#      into the running container, and Nest's watch mode (API) or Vite's dev
#      server (website) reloads it. No image rebuild. A changed dependency
#      file runs `npm ci` in the container; a changed build config rebuilds.
#
# The files in k8s/ are NOT changed. A few dev-only tweaks (1 replica, watch
# command, higher limits, a separate image name for the migrate Job, keep the
# DB disk on `tilt down`) are applied in memory below, before Tilt sends the
# YAML to the cluster.


# ---------------------------------------------------------------------------
# 0. Safety checks
# ---------------------------------------------------------------------------

# Only ever run against the local k3d cluster, never a shared one by mistake.
# (Tilt already refuses most remote clusters, but this makes it explicit.)
# Create it once with:
#   k3d cluster create openfx-dev --agents 0 --registry-create openfx-registry:0.0.0.0:5001
if k8s_context() != 'k3d-openfx-dev':
    # fail() stops the Tiltfile and shows this message in the terminal and UI
    fail('Current kubectl context is "%s". Run: kubectl config use-context k3d-openfx-dev' % k8s_context())

# The Secret is created by hand from the git-ignored k8s/.env.k8s (see
# k8s/README.md), so Tilt never manages it. Check it exists, because
# without it every Pod gets stuck in CreateContainerConfigError.
# local() runs a shell command on the Mac and returns its output.
secret = str(local(
    'kubectl get secret openfx-secrets -n openfx --ignore-not-found -o name',
    quiet=True,   # don't print the command's output in the Tilt log
)).strip()
if not secret:
    fail('Secret openfx-secrets is missing. Create it first:\n' +
         '  kubectl apply -f k8s/namespace.yaml\n' +
         '  kubectl create secret generic openfx-secrets -n openfx --from-env-file=k8s/.env.k8s')


# ---------------------------------------------------------------------------
# 1. Load the Kubernetes manifests
# ---------------------------------------------------------------------------

# listdir() is NOT recursive, so k8s/examples/secret.example.yaml is never
# picked up. We also skip anything with "secret" in the name, just in case
# someone later saves a real secret.yaml next to the others.
manifest_files = [
    f for f in listdir('k8s')
    if f.endswith('.yaml') and 'secret' not in f
]

# Read every file and turn it into a list of plain dicts, one per k8s object.
# (A single file can hold several objects separated by ---.)
objects = []
for f in manifest_files:
    objects += decode_yaml_stream(read_file(f))

# Dev-only tweaks, applied in memory. The files on disk stay as they are.
for obj in objects:
    kind = obj['kind']
    name = obj['metadata']['name']

    if kind == 'Deployment' and name == 'openfx-api':
        # One Pod is enough locally, and it means only one container to sync into
        obj['spec']['replicas'] = 1
        api = obj['spec']['template']['spec']['containers'][0]
        # deployment.yaml says `node dist/main.js`, which never reloads.
        # Swap in Nest's watch mode, which recompiles + restarts on every change.
        # (Done here, not with Tilt's `entrypoint=`, because that would also
        # override the migrate Job's command, since it uses the same image.)
        api['command'] = ['node_modules/.bin/nest', 'start', '--watch']
        # The TypeScript compiler running in watch mode needs far more memory
        # than the compiled app. 256Mi gets it OOMKilled, so raise the cap here.
        api['resources']['limits'] = {'cpu': '1', 'memory': '1Gi'}

    if kind == 'Deployment' and name == 'openfx-frontend':
        # One copy is enough locally, and only one container gets live-updated
        obj['spec']['replicas'] = 1
        web = obj['spec']['template']['spec']['containers'][0]
        # frontend.yaml checks nginx's /healthz, which Vite's dev server doesn't
        # have. Check the home page instead (same port, 8080).
        web['readinessProbe']['httpGet']['path'] = '/'
        web['livenessProbe']['httpGet']['path'] = '/'
        # Vite's dev server needs far more than the 128Mi nginx gets
        web['resources']['limits'] = {'cpu': '1', 'memory': '512Mi'}

    if kind == 'Job' and name == 'openfx-migrate':
        # migrate-job.yaml uses the same image as the API (openfx:v1). If it
        # kept that name here, every live update to the API would also hit
        # this Job, whose container has already exited. Tilt can't sync into a
        # stopped container, so it would fall back to a full rebuild + image
        # load + re-running migrations on EVERY save. Giving the Job its own
        # image name (built in section 2b) keeps the two apart.
        obj['spec']['template']['spec']['containers'][0]['image'] = 'openfx-migrate'

    if kind == 'PersistentVolumeClaim' and name == 'postgres-data':
        # `tilt down` deletes everything Tilt created. This annotation tells it
        # to leave the database disk alone, so balances and trades survive.
        obj['metadata'].setdefault('annotations', {})['tilt.dev/down-policy'] = 'keep'

# Hand the (tweaked) objects to Tilt. Tilt applies them, and watches the
# k8s/ files so a saved manifest change re-applies automatically.
k8s_yaml(encode_yaml_stream(objects))
watch_file('k8s')


# ---------------------------------------------------------------------------
# 2. Build the API image, with live update
# ---------------------------------------------------------------------------

# k3d gave us a local registry (see the safety check above) and advertised it
# to Tilt, so plain docker_build just works: Tilt builds, pushes the image to
# localhost:5001, and the cluster pulls it from there. Only layers that changed
# are pushed, which is much faster than copying a whole image into Minikube.
docker_build(
    # The name matches `image: openfx:v1` in deployment.yaml (Tilt matches
    # the name and ignores the tag). The migrate Job was renamed away from
    # it above, so this image is only used by the API.
    'openfx',
    '.',
    dockerfile='Dockerfile.dev',
    # Only these files can trigger a build or a live update. A change to
    # anything else in the repo (README, k8s/, frontend/...) is ignored.
    only=['src', 'package.json', 'package-lock.json',
          'tsconfig.json', 'tsconfig.build.json', 'nest-cli.json'],
    # Instead of rebuilding the image on every save, run these steps against
    # the running container. Order matters: fall_back_on, then sync, then run.
    live_update=[
        # Build config can't be patched into a running container, so do a full
        # image rebuild for these. (Dockerfile.dev itself always rebuilds.)
        # package.json and the lockfile are NOT here: they are handled below by
        # running `npm ci` inside the container, which is faster.
        fall_back_on(['tsconfig.json', 'tsconfig.build.json', 'nest-cli.json']),
        # Copy changed files from the Mac into /app in the container.
        # For src/, Nest's watch mode notices, recompiles, and restarts the app.
        sync('src', '/app/src'),
        sync('package.json', '/app/package.json'),
        sync('package-lock.json', '/app/package-lock.json'),
        # Reinstall dependencies, but ONLY when a dependency file changed.
        run('cd /app && npm ci', trigger=['package.json', 'package-lock.json']),
        # Watch mode only restarts on a change in src/, so after a reinstall
        # touch a source file to make it recompile and pick up the new packages.
        run('touch /app/src/main.ts', trigger=['package.json', 'package-lock.json']),
    ],
)


# ---------------------------------------------------------------------------
# 2b. Build the migrate Job's image (no live update)
# ---------------------------------------------------------------------------

# The Job runs once and exits, so there's nothing to live-update. It's built
# from the normal production Dockerfile, so migrations run exactly as they do
# on Render. It only rebuilds (and re-runs the Job) when DB code, migration
# files or dependencies change, not on every save.
docker_build(
    'openfx-migrate',   # matches the image name set on the Job in section 1
    '.',
    dockerfile='Dockerfile',
    # Only DB code and dependencies: an ordinary API edit must NOT rebuild this
    # image and re-run the Job. NOTE: `only` also limits the files sent to
    # `docker build`, so it must still list everything the Dockerfile COPYs
    # (the tsconfigs and nest-cli.json), or the build fails.
    only=['src/db', 'drizzle', 'package.json', 'package-lock.json',
          'tsconfig.json', 'tsconfig.build.json', 'nest-cli.json'],
)


# ---------------------------------------------------------------------------
# 3. Build the website image, with live update
# ---------------------------------------------------------------------------

# In the cluster the website normally is nginx serving a compiled bundle. For
# development Tilt builds frontend/Dockerfile.dev instead, which runs Vite's dev
# server. A saved file is copied in and Vite hot-reloads the page by itself.
docker_build(
    # Matches `image: openfx-frontend:v1` in frontend.yaml
    'openfx-frontend',
    'frontend',
    dockerfile='frontend/Dockerfile.dev',
    # Only the files the dev server uses (tests and node_modules left out)
    only=['src', 'public', 'index.html',
          'package.json', 'package-lock.json',
          'vite.config.ts', 'vite.config.tilt.ts',
          'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json'],
    live_update=[
        # Config files can't be patched into the running dev server: full rebuild
        fall_back_on(['frontend/vite.config.ts', 'frontend/vite.config.tilt.ts',
                      'frontend/tsconfig.json', 'frontend/tsconfig.app.json',
                      'frontend/tsconfig.node.json']),
        # Source files: Vite notices and hot-reloads the browser
        sync('frontend/src', '/app/src'),
        sync('frontend/public', '/app/public'),
        sync('frontend/index.html', '/app/index.html'),
        # Dependencies: copy the manifests, then reinstall only when they changed
        sync('frontend/package.json', '/app/package.json'),
        sync('frontend/package-lock.json', '/app/package-lock.json'),
        run('cd /app && npm ci', trigger=['frontend/package.json', 'frontend/package-lock.json']),
    ],
)


# ---------------------------------------------------------------------------
# 4. Resources: grouping, start order, port-forwards
# ---------------------------------------------------------------------------
# Tilt makes one "resource" (one row in its UI) per Deployment or Job.
# k8s_resource() adds settings to a resource by name.

# labels only group the rows in the UI
k8s_resource('postgres', labels=['data'])
k8s_resource('redis', labels=['data'])

# The migration Job must wait for Postgres. (It also has its own
# wait-for-postgres init container; this just keeps the UI tidy.)
k8s_resource('openfx-migrate', resource_deps=['postgres'], labels=['backend'])

k8s_resource(
    'openfx-api',
    # Start only after the tables exist and have been seeded
    resource_deps=['openfx-migrate', 'redis'],
    # localhost:8080 on the Mac -> port 3000 in the API container
    port_forwards='8080:3000',
    labels=['backend'],
)

k8s_resource(
    'openfx-frontend',
    resource_deps=['openfx-api'],
    # localhost:8081 on the Mac -> port 8080 in the website container (Vite in dev)
    port_forwards='8081:8080',
    labels=['frontend'],
)
