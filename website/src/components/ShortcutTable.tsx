import { SHORTCUT_GROUPS } from "@/ui/app/shellShortcuts";

/**
 * The shortcut sheet, rendered from the app's own table.
 *
 * The app and this page show the same accelerators, so they read one array: adding a key in
 * `src/ui/app/shellShortcuts.ts` puts it in the in-app sheet and here at the same time.
 */
export default function ShortcutTable() {
	return (
		<>
			{SHORTCUT_GROUPS.map((group) => (
				<section key={group.title}>
					<h2 id={`keys-${group.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
						{group.title}
					</h2>
					<table>
						<thead>
							<tr>
								<th>Keys</th>
								<th>Action</th>
							</tr>
						</thead>
						<tbody>
							{group.entries.map((entry) => (
								<tr key={`${group.title}-${entry.action}`}>
									<td>
										{entry.keys.map((key, index) => (
											<span key={key}>
												{index === 0 ? null : " + "}
												<kbd>{key}</kbd>
											</span>
										))}
									</td>
									<td>{entry.action}</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			))}
		</>
	);
}
