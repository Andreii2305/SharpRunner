import {
  createSingleIntegerDeclarationValidator,
  createExactGoalDeclarationValidator,
  createMultiStringDeclarationValidator,
  createExactIntegerArrayDeclarationValidator,
  createExactStringArrayDeclarationValidator,
  createExactInteger2DArrayDeclarationValidator,
  createStringArrayAccessValidator,
  createStringArrayTraversalValidator,
  createPredefinedVoidMethodCallValidator,
  createVoidMethodDefinitionCallValidator,
  createVoidMethodBodyCallValidator,
  createVoidMethodParameterCallValidator,
  createIntReturnMethodValidator,
  createStringReturnMethodValidator,
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
  if (config.type === "predefinedVoidMethodCall") return createPredefinedVoidMethodCallValidator(config);
  if (config.type === "voidMethodDefinitionCall") return createVoidMethodDefinitionCallValidator(config);
  if (config.type === "voidMethodBodyCall") return createVoidMethodBodyCallValidator(config);
  if (config.type === "voidMethodParameterCall") return createVoidMethodParameterCallValidator(config);
  if (config.type === "intReturnMethod") return createIntReturnMethodValidator(config);
  if (config.type === "stringReturnMethod") return createStringReturnMethodValidator(config);
  if (config.type === "integerArrayCount") return createIntegerArrayCountValidator(config);
  return null;
};
