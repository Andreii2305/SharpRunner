import {
  createSingleIntegerDeclarationValidator,
  createExactGoalDeclarationValidator,
  createMultiStringDeclarationValidator,
} from "./validators";

export const buildValidatorFromConfig = (config) => {
  if (!config) return null;
  if (config.type === "singleInteger") return createSingleIntegerDeclarationValidator(config);
  if (config.type === "exactGoal") return createExactGoalDeclarationValidator(config);
  if (config.type === "multiString") return createMultiStringDeclarationValidator(config);
  return null;
};
