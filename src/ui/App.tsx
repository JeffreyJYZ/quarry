import AppView from "@/ui/app/AppView";
import { useShell } from "@/ui/app/useShell";
import "@/ui/styles.css";

export default function App() {
	const shell = useShell();
	return <AppView model={shell} />;
}
