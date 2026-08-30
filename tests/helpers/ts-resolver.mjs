/**
 * Lets Node's type stripping load a module that imports its neighbours without
 * a file extension.
 *
 * The app's imports are written for a bundler, which resolves `./cache` to
 * `./cache.ts`. Node's ESM resolver does not, so a module with any *runtime*
 * import cannot be loaded directly — which is why the suites so far only cover
 * modules whose imports are all `import type` and therefore erased.
 *
 * This closes that gap for the test runner alone. Nothing in the app changes:
 * the alternative was `allowImportingTsExtensions` project-wide, which would
 * change how every file in the codebase is written for the sake of a test.
 *
 * Registered by the test that needs it, before it imports the module.
 */

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    // Only relative, extensionless specifiers — the bundler convention. Anything
    // else failing to resolve is a real problem and is left to fail.
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
