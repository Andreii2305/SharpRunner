import {
  createSingleIntegerDeclarationValidator,
  createExactGoalDeclarationValidator,
  createMultiStringDeclarationValidator,
  createExactIntegerArrayDeclarationValidator,
  createExactStringArrayDeclarationValidator,
  createExactInteger2DArrayDeclarationValidator,
  createStringArrayAccessValidator,
  createStringArrayTraversalValidator,
  createIntegerArrayCountValidator,
} from "./validators";

export const buildValidatorFromConfig = (config) => {
  if (!config) return null;
  if (config.type === "singleInteger") return createSingleIntegerDeclarationValidator(config);
  if (config.type === "exactGoal") return createExactGoalDeclarationValidator(config);
  if (config.type === "multiString") return createMultiStringDeclarationValidator(config);
  if (config.type === "exactIntegerArray") return createExactIntegerArrayDeclarationValidator(config);
  if (config.type === "exactStringArray") return createExactStringArrayDeclarationValidator(config);
  if (config.type === "exactInteger2DArray") return createExactInteger2DArrayDeclarationValidator(config);
  if (config.type === "stringArrayAccess") return createStringArrayAccessValidator(config);
  if (config.type === "stringArrayTraversal") return createStringArrayTraversalValidator(config);
  if (config.type === "integerArrayCount") return createIntegerArrayCountValidator(config);
  return null;
};
