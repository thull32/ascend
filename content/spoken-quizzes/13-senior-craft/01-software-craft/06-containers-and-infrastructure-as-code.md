---
lesson: containers-and-infrastructure-as-code
source: 23b25ec5ea750aea
---
## 1

A container is killed with exit code 137, and there is nothing in the application's logs. What is the most likely cause?

A, the image was built for the wrong CPU architecture, so the binary could not start. B, SIGKILL, most often from the out-of-memory killer after the container exceeded its memory limit. C, the application exited with 137 itself, after catching an unrecoverable internal error. D, a failed readiness probe made the platform stop the container and restart it.

[think]

The answer is B: SIGKILL, most often from the out-of-memory killer.

137 is 128 plus 9, and signal 9 is SIGKILL. Breaching a cgroup memory limit is the usual cause, and SIGKILL gives the process no chance to log. A failed readiness probe takes the pod out of the Service but does not kill it. Liveness failures do restart it, but with SIGTERM first.

## 2

A commit changes one Rust source file. In the Docker build, the planner stage's copy of the crates misses the cache and cargo chef prepare runs again, yet cargo chef cook stays cached. Why?

A, the recipe it wrote was byte-identical, and the copy step is keyed on file contents. B, the planner stage is skipped whenever the lockfile has not changed. C, cargo chef cook reads only the lockfile, which Docker tracks separately. D, BuildKit caches every run step by its command string, whatever its inputs.

[think]

The answer is A: the recipe it wrote was byte-identical, and the copy step is keyed on file contents.

The recipe describes the manifests and the lockfile, not the sources, so running prepare again produced the same bytes. The builder's copy from the planner is keyed on the copied file's checksum, so it hit, and the cook step after it stayed cached. Run steps do include their parent's key, which is why an unchanged command alone does not keep a step cached.

## 3

In this app's warm CI build, the builder's step that copies the migration crate was a cache hit, but took 29 seconds. What was it doing?

A, waiting on a lock held by the web stage, which was building at the same time. B, exporting its layers to the remote cache before the next step could begin. C, downloading and unpacking cached layers, because the next step was a miss. D, recompiling the migration crate, since copy steps always rerun their files.

[think]

The answer is C: downloading and unpacking cached layers, because the next step was a miss.

Remote cache hits are lazy. The next copy step missed, so BuildKit needed the filesystem of the step before it, and downloaded and unpacked about 670 megabytes: the Rust toolchain layer and the compiled dependencies. Exporting happens once, at the end of the build.

## 4

An image on a Debian base ends with a shell-form entrypoint that runs the app binary. On docker stop, the app logs nothing and exits after 10 seconds. Why?

A, the app handled SIGTERM, but the kernel blocks writes to logs during shutdown. B, the shell is process 1 and did not forward SIGTERM, so the app got SIGKILL. C, shell-form entrypoints run the app as root, which ignores SIGTERM by design. D, Docker sends SIGKILL first, and SIGTERM only if the process is still alive.

[think]

The answer is B: the shell is process 1 and did not forward SIGTERM, so the app got SIGKILL.

The shell form runs the command through a shell, so the shell is process 1 and the app is its child. A shell that does not forward the signal leaves the app running until docker stop's 10 second default expires and SIGKILL arrives. The exec form makes the app process 1, and on a distroless image the shell form cannot start at all.

## 5

A Kubernetes Deployment has 3 replicas, a max surge of 1 and max unavailable of 0. The new version's readiness probe never passes. What is the state 15 minutes later?

A, two old pods and one unready new pod remain, with a third of capacity missing. B, three old pods serve, one new pod is unready, and progress is reported as exceeded. C, all pods have been replaced, because readiness only delays traffic, not the rollout. D, Kubernetes has rolled back to the previous replica set and deleted the new pod.

[think]

The answer is B: three old pods serve, one new pod is unready, and progress is reported as exceeded.

With max unavailable at zero, no old pod may go until a new one is available, so the rollout stops after the first extra pod. After the progress deadline, 600 seconds by default, the Deployment reports progress deadline exceeded, but nothing rolls back automatically. Losing a third of capacity is what a max surge of zero with max unavailable of one would do.

## 6

terraform plan marks Ascend's database instance to be destroyed and then created, because storage encrypted changes from false to true, which forces replacement. What would apply do?

A, create an encrypted copy of the data, switch the endpoint, then delete the original. B, encrypt the existing storage in place during the next maintenance window. C, refuse to run, because Terraform never replaces resources that hold data. D, destroy the instance and create a new, empty one, unless deletion protection blocks it.

[think]

The answer is D: destroy the instance and create a new, empty one, unless deletion protection blocks it.

Destroy then create is exactly what it says. The provider cannot change that attribute on a live instance, so the replacement is new and empty, with a new endpoint. Deletion protection makes the destroy fail at the AWS API, and prevent destroy fails the plan, which is why production databases set them. Encrypting existing data is a migration: snapshot, encrypted copy, restore.
