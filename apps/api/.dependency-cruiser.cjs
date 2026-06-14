/**
 * Module boundary rules. The whole point of the modular monolith: a module may
 * NOT reach into another module's internals. Cross-module use goes through the
 * shared contract package (@sever/contracts) and the composition root
 * (registry.ts), never via deep imports.
 */
module.exports = {
  forbidden: [
    {
      name: "no-cross-module-internals",
      severity: "error",
      comment:
        "A module must not import another module's internal files. Use @sever/contracts for types and the registry for wiring.",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/([^/]+)/",
        pathNot: [
          // allow importing a sibling module's public entrypoint only
          "^src/modules/$1/", // same module: anything
          "^src/modules/[^/]+/index\\.ts$", // any module's public index
        ],
      },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies make modules impossible to extract.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      from: { orphan: true, pathNot: ["\\.d\\.ts$"] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      extensions: [".ts", ".js"],
    },
  },
};
