using System.Diagnostics;
using System.Collections.Immutable;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Emit;
using Microsoft.CodeAnalysis.Text;

internal sealed record CompilerRequest(
    string? Id,
    string? Command,
    string? Source,
    string? OutputDirectory,
    string? AssemblyName,
    int TimeoutMs = 10_000);

internal static class Program
{
    private const string GlobalUsings = """
        global using System;
        global using System.Collections.Generic;
        global using System.IO;
        global using System.Linq;
        global using System.Net.Http;
        global using System.Threading;
        global using System.Threading.Tasks;
        """;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly CSharpParseOptions ParseOptions = new(LanguageVersion.Latest);
    private static readonly CSharpCompilationOptions CompilationOptions = new(
        OutputKind.ConsoleApplication,
        optimizationLevel: OptimizationLevel.Release,
        allowUnsafe: false,
        deterministic: true,
        nullableContextOptions: NullableContextOptions.Enable,
        warningLevel: 4,
        concurrentBuild: false);

    private static ImmutableArray<MetadataReference> _frameworkReferences;
    private static string _targetFramework = "net8.0";

    public static async Task Main()
    {
        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = Encoding.UTF8;
        (_frameworkReferences, _targetFramework) = LoadFrameworkReferences();
        Console.Error.WriteLine($"SharpRunner Roslyn compiler host ready ({_targetFramework}, references={_frameworkReferences.Length})");

        string? line;
        while ((line = await Console.In.ReadLineAsync()) is not null)
        {
            CompilerRequest? request = null;
            try
            {
                request = JsonSerializer.Deserialize<CompilerRequest>(line, JsonOptions);
                if (string.IsNullOrWhiteSpace(request?.Id))
                    continue;

                object response = request.Command switch
                {
                    "health" => new { request.Id, success = true, ready = true, targetFramework = _targetFramework },
                    "compile" => Compile(request),
                    _ => new { request.Id, success = false, infrastructureError = true, message = "Unsupported compiler command." }
                };
                await WriteResponse(response);
            }
            catch (Exception error)
            {
                // Protocol responses never include stack traces or paths.
                if (!string.IsNullOrWhiteSpace(request?.Id))
                    await WriteResponse(new { request.Id, success = false, infrastructureError = true, message = error is JsonException ? "Invalid compiler request." : "Compiler host error." });
            }
        }
    }

    private static object Compile(CompilerRequest request)
    {
        var stopwatch = Stopwatch.StartNew();
        if (request.Source is null || string.IsNullOrWhiteSpace(request.OutputDirectory) ||
            string.IsNullOrWhiteSpace(request.AssemblyName) ||
            !request.AssemblyName.All(character => char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or '-'))
            return new { request.Id, success = false, infrastructureError = true, message = "Invalid compile request." };

        if (!Path.IsPathFullyQualified(request.OutputDirectory))
            return new { request.Id, success = false, infrastructureError = true, message = "Invalid compile output directory." };
        var outputDirectory = Path.GetFullPath(request.OutputDirectory);

        Directory.CreateDirectory(outputDirectory);
        var assemblyPath = Path.Combine(outputDirectory, $"{request.AssemblyName}.dll");
        var runtimeConfigPath = Path.Combine(outputDirectory, $"{request.AssemblyName}.runtimeconfig.json");
        var timeoutMs = Math.Clamp(request.TimeoutMs, 100, 60_000);
        using var cancellation = new CancellationTokenSource(timeoutMs);

        try
        {
            var sourceTree = CSharpSyntaxTree.ParseText(
                SourceText.From(request.Source, Encoding.UTF8), ParseOptions, "Program.cs", cancellation.Token);
            var usingsTree = CSharpSyntaxTree.ParseText(GlobalUsings, ParseOptions, "GlobalUsings.g.cs", cancellationToken: cancellation.Token);
            var compilation = CSharpCompilation.Create(
                request.AssemblyName,
                new[] { usingsTree, sourceTree },
                _frameworkReferences,
                CompilationOptions);

            EmitResult emitResult;
            using (var assemblyStream = new FileStream(assemblyPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                emitResult = compilation.Emit(assemblyStream, cancellationToken: cancellation.Token);

            var diagnostics = emitResult.Diagnostics
                .Where(diagnostic => diagnostic.Severity is DiagnosticSeverity.Error or DiagnosticSeverity.Warning)
                .Take(200)
                .Select(ToDiagnostic)
                .ToArray();
            if (!emitResult.Success)
            {
                File.Delete(assemblyPath);
                return new { request.Id, success = false, diagnostics, durationMs = stopwatch.ElapsedMilliseconds };
            }

            var runtimeMajor = int.Parse(_targetFramework.AsSpan(3, _targetFramework.Length - 5));
            File.WriteAllText(runtimeConfigPath, JsonSerializer.Serialize(new
            {
                runtimeOptions = new
                {
                    tfm = _targetFramework,
                    framework = new { name = "Microsoft.NETCore.App", version = $"{runtimeMajor}.0.0" }
                }
            }, JsonOptions), new UTF8Encoding(false));

            return new
            {
                request.Id,
                success = true,
                diagnostics,
                assemblyPath,
                runtimeConfigPath,
                durationMs = stopwatch.ElapsedMilliseconds
            };
        }
        catch (OperationCanceledException)
        {
            TryDelete(assemblyPath);
            TryDelete(runtimeConfigPath);
            return new { request.Id, success = false, timedOut = true, diagnostics = Array.Empty<object>(), durationMs = stopwatch.ElapsedMilliseconds };
        }
    }

    private static object ToDiagnostic(Diagnostic diagnostic)
    {
        var span = diagnostic.Location.GetLineSpan();
        return new
        {
            id = diagnostic.Id,
            severity = diagnostic.Severity.ToString().ToLowerInvariant(),
            message = diagnostic.GetMessage(),
            line = diagnostic.Location.IsInSource ? span.StartLinePosition.Line + 1 : 0,
            column = diagnostic.Location.IsInSource ? span.StartLinePosition.Character + 1 : 0
        };
    }

    private static (ImmutableArray<MetadataReference>, string) LoadFrameworkReferences()
    {
        var runtimeDirectory = new DirectoryInfo(RuntimeEnvironment.GetRuntimeDirectory());
        var dotnetRoot = runtimeDirectory.Parent?.Parent?.Parent?.FullName
            ?? throw new InvalidOperationException("Unable to locate the .NET installation.");
        var runtimeMajor = Environment.Version.Major;
        var targetFramework = $"net{runtimeMajor}.0";
        var packRoot = Path.Combine(dotnetRoot, "packs", "Microsoft.NETCore.App.Ref");
        var referenceDirectory = Directory.EnumerateDirectories(packRoot, $"{runtimeMajor}.*")
            .OrderByDescending(directory => Version.Parse(Path.GetFileName(directory).Split('-')[0]))
            .Select(directory => Path.Combine(directory, "ref", targetFramework))
            .FirstOrDefault(Directory.Exists)
            ?? throw new InvalidOperationException($"The {targetFramework} reference pack is unavailable.");

        var references = Directory.EnumerateFiles(referenceDirectory, "*.dll")
            .OrderBy(file => file, StringComparer.Ordinal)
            .Select(file => MetadataReference.CreateFromFile(file))
            .ToImmutableArray<MetadataReference>();
        return (references, targetFramework);
    }

    private static async Task WriteResponse(object response)
    {
        await Console.Out.WriteLineAsync(JsonSerializer.Serialize(response, JsonOptions));
        await Console.Out.FlushAsync();
    }

    private static void TryDelete(string file)
    {
        try { File.Delete(file); } catch { /* The job directory cleanup is the final safeguard. */ }
    }
}
