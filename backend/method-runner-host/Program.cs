using System.Globalization;
using System.Reflection;
using System.Runtime.Loader;
using System.Text;
using System.Text.Json;

internal sealed record MethodContract(
    string TypeName,
    string MethodName,
    string[] ParameterTypes,
    string ReturnType);

internal sealed class OutputLimitException : Exception;

internal sealed class BoundedTextWriter(int byteLimit) : TextWriter
{
    private readonly StringBuilder _buffer = new();
    private int _bytes;
    public override Encoding Encoding => Encoding.UTF8;
    public bool Exceeded { get; private set; }

    public override void Write(char value) => Append(value.ToString());
    public override void Write(string? value)
    {
        if (value is not null) Append(value);
    }
    public override void Write(char[] buffer, int index, int count) => Append(new string(buffer, index, count));
    public override string ToString() => _buffer.ToString();

    private void Append(string value)
    {
        var added = Encoding.UTF8.GetByteCount(value);
        if (_bytes + added > byteLimit)
        {
            Exceeded = true;
            throw new OutputLimitException();
        }
        _buffer.Append(value);
        _bytes += added;
    }
}

internal static class Program
{
    private const string Marker = "SHARPRUNNER_RESULT:";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly IReadOnlyDictionary<string, Type> AllowedTypes = new Dictionary<string, Type>(StringComparer.Ordinal)
    {
        ["bool"] = typeof(bool),
        ["int"] = typeof(int),
        ["long"] = typeof(long),
        ["string"] = typeof(string),
        ["bool[]"] = typeof(bool[]),
        ["int[]"] = typeof(int[]),
        ["long[]"] = typeof(long[]),
        ["string[]"] = typeof(string[]),
    };

    public static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
        CultureInfo.CurrentUICulture = CultureInfo.InvariantCulture;
        var protocolOutput = Console.Out;
        try
        {
            if (args.Length is < 2 or > 3)
                return Write(protocolOutput, new { category = "INFRASTRUCTURE_ERROR" }, 70);

            var contract = JsonSerializer.Deserialize<MethodContract>(Decode(args[0]), JsonOptions);
            var inputs = JsonSerializer.Deserialize<JsonElement[]>(Decode(args[1]), JsonOptions);
            var assemblyPath = args.Length == 3 ? Path.GetFullPath(args[2]) : "/job/StudentSubmission.dll";
            if (contract is null || inputs is null || !TryResolveTypes(contract, out var parameterTypes, out var returnType))
                return Write(protocolOutput, new { category = "INFRASTRUCTURE_ERROR" }, 70);

            var assembly = AssemblyLoadContext.Default.LoadFromAssemblyPath(assemblyPath);
            var submissionType = assembly.GetType(contract.TypeName, throwOnError: false, ignoreCase: false);
            if (submissionType is null || !submissionType.IsPublic)
                return Write(protocolOutput, new { category = "SIGNATURE_ERROR" }, 0);

            var method = submissionType.GetMethods(BindingFlags.Public | BindingFlags.Static)
                .SingleOrDefault(candidate =>
                    candidate.Name == contract.MethodName &&
                    !candidate.IsGenericMethodDefinition &&
                    candidate.ReturnType == returnType &&
                    candidate.GetParameters().Select(parameter => parameter.ParameterType).SequenceEqual(parameterTypes));
            if (method is null)
                return Write(protocolOutput, new { category = "SIGNATURE_ERROR" }, 0);

            if (inputs.Length != parameterTypes.Length)
                return Write(protocolOutput, new { category = "INFRASTRUCTURE_ERROR" }, 70);
            var arguments = new object?[inputs.Length];
            for (var index = 0; index < inputs.Length; index++)
                arguments[index] = JsonSerializer.Deserialize(inputs[index].GetRawText(), parameterTypes[index], JsonOptions);

            using var captured = new BoundedTextWriter(8 * 1024);
            Console.SetOut(captured);
            Console.SetError(captured);
            object? output;
            try
            {
                output = method.Invoke(null, arguments);
            }
            catch (TargetInvocationException error) when (error.InnerException is OutputLimitException)
            {
                return Write(protocolOutput, new { category = "OUTPUT_LIMIT" }, 0);
            }
            catch (TargetInvocationException error) when (error.InnerException is OutOfMemoryException)
            {
                return Write(protocolOutput, new { category = "RESOURCE_LIMIT" }, 0);
            }
            catch (TargetInvocationException)
            {
                return Write(protocolOutput, new { category = "RUNTIME_ERROR" }, 0);
            }
            catch
            {
                return Write(protocolOutput, new { category = "RUNTIME_ERROR" }, 0);
            }
            finally
            {
                Console.SetOut(protocolOutput);
                Console.SetError(protocolOutput);
            }

            if (captured.Exceeded)
                return Write(protocolOutput, new { category = "OUTPUT_LIMIT" }, 0);
            var studentOutput = captured.ToString().Replace("\r\n", "\n", StringComparison.Ordinal);
            return Write(protocolOutput, new { category = "SUCCESS", output, stdout = studentOutput }, 0);
        }
        catch
        {
            return Write(protocolOutput, new { category = "INFRASTRUCTURE_ERROR" }, 70);
        }
    }

    private static bool TryResolveTypes(MethodContract contract, out Type[] parameterTypes, out Type returnType)
    {
        parameterTypes = Array.Empty<Type>();
        returnType = typeof(void);
        if (contract.ParameterTypes is null || !AllowedTypes.TryGetValue(contract.ReturnType, out returnType!))
            return false;
        var resolved = new Type[contract.ParameterTypes.Length];
        for (var index = 0; index < resolved.Length; index++)
        {
            if (!AllowedTypes.TryGetValue(contract.ParameterTypes[index], out resolved[index]!))
                return false;
        }
        parameterTypes = resolved;
        return true;
    }

    private static string Decode(string value)
    {
        var normalized = value.Replace('-', '+').Replace('_', '/');
        normalized = normalized.PadRight(normalized.Length + ((4 - normalized.Length % 4) % 4), '=');
        return Encoding.UTF8.GetString(Convert.FromBase64String(normalized));
    }

    private static int Write(TextWriter output, object value, int exitCode)
    {
        output.WriteLine($"{Marker}{JsonSerializer.Serialize(value, JsonOptions)}");
        output.Flush();
        return exitCode;
    }
}
