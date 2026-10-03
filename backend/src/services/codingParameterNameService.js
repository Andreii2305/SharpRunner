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

const resolveCodingParameterNames = (parameterTypes, parameterNames) => {
  const types = Array.isArray(parameterTypes) ? parameterTypes : [];
  if (Array.isArray(parameterNames)) return [...parameterNames];
  return types.map((_, index) => `arg${index + 1}`);
};

const validateExplicitCodingParameterNames = (parameterTypes, parameterNames) => {
  if (parameterNames == null) return true;
  if (!Array.isArray(parameterTypes) || !Array.isArray(parameterNames)
    || parameterNames.length !== parameterTypes.length) {
    throw new TypeError("Coding parameter names must match the parameter types");
  }
  const seen = new Set();
  for (const name of parameterNames) {
    if (typeof name !== "string" || !name.length) {
      throw new TypeError("Coding parameter name is required");
    }
    if (name.length > MAX_PARAMETER_NAME_LENGTH
      || !CSHARP_PARAMETER_IDENTIFIER.test(name)
      || CSHARP_RESERVED_KEYWORDS.has(name)) {
      throw new TypeError("Coding parameter name must be a valid C# identifier");
    }
    if (seen.has(name)) throw new TypeError("Coding parameter names must be unique");
    seen.add(name);
  }
  return true;
};

module.exports = {
  CSHARP_RESERVED_KEYWORDS,
  MAX_PARAMETER_NAME_LENGTH,
  resolveCodingParameterNames,
  validateExplicitCodingParameterNames,
};
