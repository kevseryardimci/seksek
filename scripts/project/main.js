
import { SekSekStages } from "./seksekStages.js";
import { LayoutNavigation } from "./navigation.js";

runOnStartup(async runtime =>
{
	// Code to run on the loading screen.
	// Note layouts, objects etc. are not yet available.
	
	runtime.addEventListener("beforeprojectstart", () => OnBeforeProjectStart(runtime));
});

async function OnBeforeProjectStart(runtime)
{
	// Initialise the game controller only when the oyun layout is active.
	// If the project starts on kapak, its game objects do not exist yet.
	const ensureGameController = () => {
		let layoutName = "";
		try { layoutName = runtime.layout?.name || ""; } catch (_) {}
		if (layoutName !== "oyun") return;
		if (!runtime.__sekSekGame?.stone) {
			runtime.__sekSekGame = new SekSekStages(runtime);
			console.info("[SekSek] Oyun layoutu için controller oluşturuldu");
		}
	};
	ensureGameController();
	runtime.addEventListener("afterlayoutstart", ensureGameController);
	runtime.__sekSekNavigation ??= new LayoutNavigation(runtime);
	console.info("[SekSek] JavaScript oyun kontrolcüsü başlatıldı");
	// Construct Touch/Mouse input is exposed through runtime pointer events.
	runtime.addEventListener("pointerup", event => runtime.__sekSekGame?.handleRuntimePointer(event));
	runtime.addEventListener("tick", () => runtime.__sekSekGame?.tick());
}
