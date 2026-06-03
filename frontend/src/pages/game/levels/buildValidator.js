import {
  createSingleIntegerDeclarationValidator,
  createExactGoalDeclarationValidator,
  createMultiStringDeclarationValidator,
  createExactIntegerArrayDeclarationValidator,
} from "./validators";

export const buildValidatorFromConfig = (config) => {
  if (!config) return null;
  if (config.type === "singleInteger") return createSingleIntegerDeclarationValidator(config);
  if (config.type === "exactGoal") return createExactGoalDeclarationValidator(config);
  if (config.type === "multiString") return createMultiStringDeclarationValidator(config);
  if (config.type === "exactIntegerArray") return createExactIntegerArrayDeclarationValidator(config);
  return null;
};
