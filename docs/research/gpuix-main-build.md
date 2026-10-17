# gpuix renderer fork

ZoeyDAW consumes the renderer from the recursive Git submodule `vendor/gpuix`, pinned by the parent repository's gitlink. The fork is `chacelow/gpuix` on branch `zoeydaw`; its `zed` dependency is the matching `chacelow/zed` fork. This keeps renderer changes reviewable and versioned as ordinary upstream commits rather than replayed patches.

## Checkout and build

Initialize the renderer and its nested Zed submodule with:

```sh
git submodule update --init --recursive
node scripts/gpuix-main/build.mjs runtime
pnpm install --frozen-lockfile
pnpm native:build
```

On macOS, use `precompiled` instead of `runtime` when building Metal shaders ahead of time. Both modes include `test-support`; runtime mode enables `gpui_platform/runtime_shaders`. Windows x64 uses the same Node build command. Native, host and React outputs, including Cargo's target directory, remain under the submodule's gitignored `build/` directories. Windows repairs pnpm's relative dependency links as junctions after install.

`pnpm:devPreinstall` checks that both submodules and renderer build outputs exist. If absent, initialize the submodules and run the build command above. There is no npm renderer fallback.

## Changing the renderer

1. Make renderer changes in `vendor/gpuix` (and `vendor/gpuix/zed` for Zed changes), then commit them in that submodule. Keep ZoeyDAW-specific changes in the renderer fork rather than carrying a patch series in this repository.
2. Push gpuix commits to `chacelow/gpuix`, branch `zoeydaw`; push nested Zed commits to `chacelow/zed`, branch `zoeydaw`. Update the gpuix fork's zed gitlink when the nested fork changes.
3. Update the parent repository's `vendor/gpuix` gitlink to the desired pushed commit and commit that change here. The root checkout and CI use the pinned gitlink, not the branch tip.
4. Rebuild and run relevant renderer, app, and native checks before landing.

Fresh clones use `shallow = true` for the renderer submodule. Initialize both repository levels with `git submodule update --init --recursive --depth 1 --filter=blob:none`; Git fetches missing objects on demand.

## Rebasing and upstreaming

To rebase the fork, fetch `remorses/gpuix` into the fork clone, rebase `zoeydaw` onto the selected upstream commit, and resolve changes in the fork itself. For changes to Zed, rebase `chacelow/zed`'s `zoeydaw` branch onto `zed-industries/zed` (or its current canonical upstream), then update gpuix's `zed` gitlink to that rebased commit. Verify both forks and the app before pushing, then bump the parent gitlink if its renderer commit changed.

A change suitable for upstream should be isolated into a commit against the relevant upstream project, pushed to a personal branch, and submitted as a PR to `remorses/gpuix` or Zed upstream. Once upstream accepts it, rebase/drop the corresponding fork commit and advance the fork baseline; do not keep duplicate local patches.
