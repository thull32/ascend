---
lesson: containers-and-infrastructure-as-code
source: 49771a3ded60d2a2
fit: great
desk:
  - "The four real CI builds and the warm build's step-by-step BuildKit table"
  - "The multi-stage Dockerfile diagram and the layer sizes per stage"
  - "The Kubernetes Deployment manifest, read as decisions"
  - "The rolling-update table and the controller's scale-up and scale-down formulas"
  - "The two Terraform plans, in place and forced replacement"
  - "Exercises: which layers will rebuild, and simulate a rolling update"
---
## Introduction

The service runs on one VM that someone configured by hand three years ago. It needs a particular OpenSSL, a CA bundle someone patched, and an environment variable set in a file nobody remembers editing. When the disk dies, rebuilding the machine takes a week of archaeology. Meanwhile a new engineer cannot run the app locally, because their machine has a different Python minor version.

Those are two different problems. The first is that the environment is undocumented state. The second is that the runtime is not packaged with the code. Infrastructure as code fixes the first, by making the environment a reviewed file. Containers fix the second, by shipping the runtime with the application.

Four ideas, then. What a container and an image really are. Why image layers are a cache, and how to stop a build missing it. What a rolling update does, especially when the new version never becomes ready. And how to read a Terraform plan before it deletes your database.

## What a container actually is

A container is not a small virtual machine. It is an ordinary Linux process that the kernel shows a restricted view of the system. Namespaces give it its own process IDs, network interfaces, mount table and hostname, so inside, the application is PID 1 and sees only its own files. Cgroups cap what it may consume: CPU, memory, number of processes. And the image supplies its filesystem, a stack of read-only layers with one thin writable layer on top.

Consequences follow. Containers start in milliseconds, because nothing boots; the kernel is shared. Isolation is weaker than a VM's for the same reason. And when a process goes over its cgroup memory limit, the kernel's OOM killer sends SIGKILL. You see exit code 137, which is 128 plus signal 9, usually with no application log at all.

An image is a manifest listing layers, each identified by the SHA-256 of its bytes. A tag like node 24 slim is only a mutable pointer to one of those digests. Pin the digest in the Dockerfile, and the base image you build on becomes part of the reviewed code instead of an accident of build time.

One more detail about layers, and it is a security one. Deleting a file in a later step does not remove it. It writes a whiteout marker in the upper layer, and the bytes stay in the layer below. So a secret copied in one step and deleted in the next is still in the image, for anyone who unpacks the earlier layer.

## Layers are a cache

BuildKit gives every step a cache key, built from the step's definition and its parent's key. For a COPY, the key includes a checksum of the copied files' contents, but not their modification times. For a RUN, it includes only the command string and the environment. BuildKit never looks at what the command would fetch, so "apt-get update" stays cached with stale package indexes until something above it changes.

Here is the rule that matters most. When one key changes, that step and every step after it in the stage misses. So the naive Dockerfile, copy the whole project and then build, recompiles every dependency on every commit. The better one copies only the dependency manifests first, builds the dependencies, and copies the source code after. Order the steps from least to most frequently changing.

Build arguments are a trap here. A build argument that changes on every commit, like the commit hash, invalidates every RUN step after it is declared. Ascend declares its commit argument immediately before the final compile, which reruns anyway. Declared at the top of the stage, it would recompile every dependency on every deploy.

Ascend's own build shows how much this is worth. A commit changed one Rust source file. The planner step that copies the code missed, and the tool called cargo chef reran its prepare step. But the recipe it wrote describes the manifests and the lockfile, not the source, so its bytes were identical. The next stage copies that recipe, the copy is keyed on the file's checksum, so it hit, and the slow dependency build stayed cached. That one mechanism saves about 105 to 119 seconds per commit on this project.

Now look at a warm build that took 136 seconds. Compiling took 62 of them. Downloading the cache took about 29, and exporting it at the end took 28. Moving the cache in and out cost almost as much as the compile. Remote cache hits are lazy: a cached step is only downloaded when a later step needs its filesystem. So the step just before the first miss can be a hit that still takes 29 seconds, because it is unpacking the Rust toolchain and the compiled dependencies.

## The image that ships

The Dockerfile is a multi-stage build. Each stage has its own toolchain, and later stages copy only the outputs they need, so build tools never reach production. A Node stage builds the web app. Rust stages compile one binary that embeds the web app and the curriculum. The final stage is distroless, running as a non-root user.

The numbers make the case. A local build in September measured the runtime image at 62 megabytes unpacked and about 22 compressed: some 32 megabytes of distroless layers, glibc, OpenSSL, certificates and time zones, plus a 30 megabyte binary. The Rust toolchain layer the builder starts from is 289 megabytes compressed, by itself. None of that ships.

Distroless has no shell and no package manager. That is less for an attacker, and it also means no shelling into the container for you. You debug through logs, metrics and ephemeral debug containers.

## PID 1 and signals

The image ends with the exec form of entrypoint, so the binary itself is PID 1. That matters, because a namespace's PID 1 receives only the signals it has installed a handler for. SIGKILL from outside is the exception. So a PID 1 with no SIGTERM handler simply ignores a stop request, until the platform gives up and kills it.

How long does the platform wait? Docker stop waits 10 seconds by default. Kubernetes waits its termination grace period, 30 seconds by default. Railway waits its draining setting, which defaults to zero, and which this app has set to 60.

The shell form of entrypoint breaks both ways. It runs your binary through a shell. In distroless there is no shell, so the container fails to start at all. On an image with a shell, the shell becomes PID 1 and may not forward SIGTERM, so the application gets SIGKILL at the end of the grace period with requests in flight. And a process that forks workers or shells out must also reap its zombie children, so it should run under a tiny init like tini.

## A rolling update, traced

Kubernetes works by reconciliation: controllers loop forever, comparing the declared state with the actual state and acting to close the gap. A Deployment declares a replica count and a rollout strategy.

Take three replicas, a max surge of one, and max unavailable of zero. So the controller may run at most four pods, and must keep at least three available. Change the image, and it creates one new pod. It waits for that pod's readiness probe to pass. Only then may it remove an old pod, because now four are available and three are required. Then a second new pod, wait for ready, remove another old one. Then the third. At no point are fewer than three pods serving.

Readiness and liveness are different jobs. Readiness removes a pod from rotation; liveness restarts it. Point readiness at the endpoint that checks the database, and liveness at the one that checks only the process, so a database blip removes pods from traffic instead of restarting all of them.

Now the important case. The new version cannot reach a dependency, so its readiness probe fails every time. What state are you in fifteen minutes later?

[pause]

The rollout stopped at step one. Three old pods serve at full capacity, and one new pod sits unready; the only cost is the extra pod. After the progress deadline, 600 seconds by default, the Deployment reports progress deadline exceeded, and the rollout status command exits non-zero, which is how a pipeline notices. But Kubernetes does not roll back. Someone runs a rollout undo, or a controller doing canary analysis does it.

Flip the strategy to a max surge of zero and max unavailable of one, and the same stuck rollout leaves only two old pods serving: a third of capacity gone until someone acts. Choosing surge over unavailability is choosing to pay for one pod rather than risk capacity.

The opposite failure is worse. The new version passes readiness and is broken in a way a simple database ping cannot see, so the rollout completes. Readiness proves an instance can serve. Only canary analysis proves it serves correctly.

## Terraform: the plan is the artifact you review

Terraform keeps a state file mapping each resource to a real ID and its last-known attributes. "Plan" refreshes those attributes from the provider, diffs your configuration against them, and prints the actions. "Apply" executes them. The plan is what you review.

Change a database's instance class and the plan says "updated in place", one to change. Now also turn on storage encryption. The plan changes to "must be replaced", one to add and one to destroy, with "forces replacement" beside the encryption line. The provider cannot change that attribute on a live database. So apply would destroy the database and create a new one, with a new endpoint, and it would be empty. Deletion protection makes the destroy fail at the cloud provider's API, and a prevent-destroy rule makes the plan itself error. Neither makes the change safe; they make it loud. Encrypting an existing database is a migration: snapshot, copy the snapshot with encryption, restore, cut over.

Drift, next. During an incident, an engineer raises the backup retention from 7 days to 14 in the console. The next plan notices, and proposes setting it back to 7. Applying reverts the fix. Editing the file to 14 adopts it. A refresh-only apply writes 14 into state, but the next plan still proposes 7, because the configuration is the desired state, and only the file settles it. Catch drift sooner with a scheduled plan using the detailed exit code: exit 2 on an untouched main branch means drift.

And locking. Without a lock, two applies both read state version 41, both create resources, and both write version 42. The second write wins. The first apply's resources exist in the cloud and not in state, billed and invisible. State also holds every attribute, database passwords included, in plain text, so it lives in an encrypted, access-controlled remote backend, never in Git.

Ascend uses Railway's infrastructure-as-code instead, which has no state file: it diffs the file against the live environment at plan time. One story from it is worth keeping. The engine silently ignored two declarations whose shape it did not know: backup schedules, and a volume mount for Prometheus. The volume was created but never attached, so Prometheus lost its data on every deploy. A clean plan proves the file and the platform agree on what the engine reads, not on what you wrote.

GitOps applies reconciliation to delivery. A Git repository holds the desired state, an agent inside the cluster keeps the cluster matching it, a deploy is a merged pull request, and rollback is a revert. The security argument: production credentials never leave the cluster.

## In the interview

"Our image build takes 12 minutes. Make it faster." What do you look at first?

[pause]

The BuildKit log: find the first step that is not cached, and why. An early copy of the whole project, a lockfile copied with the source, or a per-commit build argument above a heavy step. Then confirm the cache reaches ephemeral runners, with a remote cache that exports every stage, and measure what moving it costs: 57 seconds of 136 in this app's warm build. The common wrong answer is a bigger machine or a smaller base image, neither of which changes what misses.

And: "The plan shows destroy and create on the production database." Find the attribute that forces replacement, and do not apply. Revert, or plan a snapshot-and-restore migration. The wrong answer is "apply it in the maintenance window", which replaces your data with an empty database whenever it runs.

## Recap

Four things to remember. A container is a process with namespaces and cgroups over content-addressed layers; exit 137 means SIGKILL, usually out of memory, and a deleted secret is still in the earlier layer. One cache miss invalidates every later step, so order the Dockerfile from least to most frequently changing and put per-commit arguments last. With max unavailable at zero, a rollout whose new pod never becomes ready stops with full capacity, reports a deadline, and never rolls itself back. And read every plan: "forces replacement" on a database means a new, empty one.

At your desk: the four real CI builds and the warm build's step table, the multi-stage diagram, the Deployment manifest, the rolling-update table, the two Terraform plans, and the layer-cache and rolling-update exercises.
