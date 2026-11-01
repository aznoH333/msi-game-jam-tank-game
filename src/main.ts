const canvasElement = document.querySelector<HTMLCanvasElement>("#game");
if (!canvasElement) {
  throw new Error("Missing #game canvas");
}

const renderingContext = canvasElement.getContext("2d");
if (!renderingContext) {
  throw new Error("2D canvas is unavailable");
}

const canvas: HTMLCanvasElement = canvasElement;
const context: CanvasRenderingContext2D = renderingContext;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function draw(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;

  context.fillStyle = "#111318";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#f4f1ea";
  context.font = "48px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("Hello World", width / 2, height / 2);
}

window.addEventListener("resize", resize);
resize();
