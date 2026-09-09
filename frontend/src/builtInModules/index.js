import arrays from "./arrays.js";
import finalReview from "./finalReview.js";
import functions from "./functions.js";
import functionsWithArrays from "./functionsWithArrays.js";
import tutorial from "./tutorial.js";

export const builtInModules = [tutorial, arrays, functions, functionsWithArrays, finalReview];
export const builtInModuleById = new Map(builtInModules.map((module) => [module.id, module]));
export const getBuiltInModule = (moduleId) => builtInModuleById.get(moduleId) ?? null;
