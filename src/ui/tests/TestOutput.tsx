import { capOutput, OUTPUT_LINE_CAP } from "./parts";

export function TestOutput({ output }: { output: string }) {
	const capped = capOutput(output);
	return (
		<>
			<pre className="test-output">{capped.text}</pre>
			{capped.truncated ? (
				<p className="test-output-more">first {OUTPUT_LINE_CAP} lines</p>
			) : null}
		</>
	);
}
