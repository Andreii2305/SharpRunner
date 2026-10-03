const CSHARP_RESERVED_KEYWORDS = new Set([
  "abstract", "as", "base", "bool", "break", "byte", "case", "catch", "char", "checked",
  "class", "const", "continue", "decimal", "default", "delegate", "do", "double", "else", "enum",
  "event", "explicit", "extern", "false", "finally", "fixed", "float", "for", "foreach", "goto",
  "if", "implicit", "in", "int", "interface", "internal", "is", "lock", "long", "namespace",
  "new", "null", "object", "operator", "out", "override", "params", "private", "protected",
  "public", "readonly", "ref", "return", "sbyte", "sealed", "short", "sizeof", "stackalloc",
  "static", "string", "struct", "switch", "this", "throw", "true", "try", "typeof", "uint",
  "ulong", "unchecked", "unsafe", "ushort", "using", "virtual", "void", "volatile", "while",
]);

const CSHARP_PARAMETER_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_PARAMETER_NAME_LENGTH = 64;

export const resolveParameterNames = (parameterTypes, parameterNames) => {
  const types = Array.isArray(parameterTypes) ? parameterTypes : [];
  return Array.isArray(parameterNames)
    ? [...parameterNames]
    : types.map((_, index) => `arg${index + 1}`);
};

export const parameterNameError = (parameterNames, index) => {
  const name = parameterNames?.[index];
  if (typeof name !== "string" || !name.trim()) return "required";
  if (name.length > MAX_PARAMETER_NAME_LENGTH
    || !CSHARP_PARAMETER_IDENTIFIER.test(name)
    || CSHARP_RESERVED_KEYWORDS.has(name)) return "invalid";
  return parameterNames.some((candidate, candidateIndex) => candidateIndex !== index && candidate === name)
    ? "duplicate"
    : null;
};

export const formatArrayPreview = (value) => (
  `[${(Array.isArray(value) ? value : []).map((item) => JSON.stringify(item)).join(", ")}]`
);
