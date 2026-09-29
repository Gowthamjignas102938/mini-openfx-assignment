# Tiltfile for MiniOpenFX on local Minikube.
#
# Run from the repo root:   tilt up      (press space to open the web UI)
# Stop and clean up:        tilt down
#
# This file is Starlark, a small Python-like language. Tilt runs it top to
# bottom on start, and again whenever you save it.
#
# What it does:
#   1. builds three images: the API (openfx, dev image), the migrate Job
#      (openfx-migrate, production image) and the website (openfx-frontend)
#   2. applies every manifest in k8s/ (never the secret template)
#   3. port-forwards the API to localhost:8080 and the website to localhost:8081
#   4. live-updates the API: a changed .ts file is copied into the running
#      container and Nest's watch mode recompiles and restarts it. No image
#      rebuild. The website is a compiled bundle served by nginx, so a change
#      there rebuilds its image instead.
#
# The files in k8s/ are NOT changed. A few dev-only tweaks (1 replica, watch
# command, higher limits, a separate image name for the migrate Job, keep the
# DB disk on `tilt down`) are applied in memory below, before Tilt sends the
# YAML to the cluster.


# ---------------------------------------------------------------------------
# 0. Safety checks
# ---------------------------------------------------------------------------

# Only ever run against the local Minikube cluster, never a shared one by mistake.
# (Tilt already refuses most remote clusters, but this makes it explicit.)
if k8s_context() != 'minikube':
    # fail() stops the Tiltfile and shows this message in the terminal and UI
    fail('Current kubectl context is "%s". Run: kubectl config use-context minikube' % k8s_context())

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
        # One copy is enough locally, and it makes each rebuild roll out faster
        obj['spec']['replicas'] = 1

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

# Why custom_build and not the usual docker_build: this Minikube uses the
# containerd runtime, so Tilt can't build straight into Minikube's image
# store. Instead we build with the Mac's Docker, then copy the image into
# Minikube ourselves. Tilt fills in $EXPECTED_REF with a fresh, unique tag
# (like openfx:tilt-build-1790664528) on every build, which is why the
# imagePullPolicy: IfNotPresent in deployment.yaml is fine.
custom_build(
    # The name matches `image: openfx:v1` in deployment.yaml (Tilt matches
    # the name and ignores the tag). The migrate Job was renamed away from
    # it above, so this image is only used by the API.
    'openfx',
    'docker build -f Dockerfile.dev -t $EXPECTED_REF . && minikube image load $EXPECTED_REF',
    # Files that trigger a build. Changes to anything else are ignored.
    deps=['src', 'package.json', 'package-lock.json',
          'tsconfig.json', 'tsconfig.build.json', 'nest-cli.json', 'Dockerfile.dev'],
    # Nothing to push to a registry: the image is already inside Minikube after `image load`
    disable_push=True,
    # Normally Tilt re-tags the finished image in the Mac's Docker and deploys
    # that new tag. But Minikube only has the tag we loaded ($EXPECTED_REF),
    # so without this the Pods ask for a tag Minikube has never seen and end
    # up in ImagePullBackOff. This says: deploy exactly $EXPECTED_REF.
    skips_local_docker=True,
    # Instead of rebuilding the image on every save, run these steps against
    # the running container. Order matters: fall_back_on must come first.
    live_update=[
        # A dependency or build-config change can't be patched into a running
        # container, so do a full image rebuild for these instead.
        fall_back_on(['package.json', 'package-lock.json', 'tsconfig.json',
                      'tsconfig.build.json', 'nest-cli.json', 'Dockerfile.dev']),
        # Copy changed files from the Mac's src/ into /app/src in the container.
        # Nest's watch mode notices, recompiles, and restarts the app by itself.
        sync('src', '/app/src'),
    ],
)


# ---------------------------------------------------------------------------
# 2b. Build the migrate Job's image (no live update)
# ---------------------------------------------------------------------------

# The Job runs once and exits, so there's nothing to live-update. It's built
# from the normal production Dockerfile, so migrations run exactly as they do
# on Render. It only rebuilds (and re-runs the Job) when DB code, migration
# files or dependencies change, not on every save.
custom_build(
    'openfx-migrate',   # matches the image name set on the Job in section 1
    'docker build -t $EXPECTED_REF . && minikube image load $EXPECTED_REF',
    deps=['src/db', 'drizzle', 'package.json', 'package-lock.json', 'Dockerfile'],
    disable_push=True,
    skips_local_docker=True,
)


# ---------------------------------------------------------------------------
# 3. Build the website image (full rebuild on change)
# ---------------------------------------------------------------------------

# The website is compiled by Vite into static files that nginx serves, so
# there's nothing to live-patch. Any change rebuilds and reloads the image.
custom_build(
    # Matches `image: openfx-frontend:v1` in frontend.yaml
    'openfx-frontend',
    'docker build -t $EXPECTED_REF frontend && minikube image load $EXPECTED_REF',
    # Only the files that end up in the build (tests and node_modules left out)
    deps=['frontend/src', 'frontend/public', 'frontend/nginx', 'frontend/index.html',
          'frontend/package.json', 'frontend/package-lock.json', 'frontend/vite.config.ts',
          'frontend/tsconfig.json', 'frontend/tsconfig.app.json', 'frontend/tsconfig.node.json',
          'frontend/Dockerfile'],
    disable_push=True,
    skips_local_docker=True,   # same reason as for the API image above
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
    # localhost:8081 on the Mac -> nginx's port 8080 in the website container
    port_forwards='8081:8080',
    labels=['frontend'],
)
