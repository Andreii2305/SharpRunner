export const p = (text) => ({ type: "paragraph", text });
export const list = (...items) => ({ type: "list", items });
export const heading = (text) => ({ type: "heading", text });
export const code = (value, output, title = "C# example", runnable = output != null) => ({ type: "code", value, output, title, runnable });
export const note = (label, text, tone = "note") => ({ type: "note", label, text, tone });
export const diagram = (headers, rows, caption) => ({ type: "diagram", headers, rows, caption });
export const practice = (id, prompt, starterCode, solution, expectedOutput) => ({ type: "practice", id, prompt, starterCode, solution, expectedOutput });
export const check = (id, prompt, options, answer, feedback) => ({
  type: "check", id, prompt, options, answer, feedback,
});
export const connection = (text) => ({ type: "connection", text });

export const microsoft = (title, url) => ({ title: `Microsoft Learn. ${title}`, url });
export const codeChumReference = {
  title: "CodeChum. C# Programming learning modules/course materials used for SharpRunner curriculum alignment. Access may require enrolled student credentials.",
};
