function initializeHistogramWorker() {
    const workerScript = `
        self.onmessage = function(e) {
            const { imageData } = e.data;
            const data = imageData.data;
            const red = new Uint32Array(256);
            const green = new Uint32Array(256);
            const blue = new Uint32Array(256);

            for (let i = 0; i < data.length; i += 4) {
                red[data[i]]++;
                green[data[i + 1]]++;
                blue[data[i + 2]]++;
            }

            self.postMessage({ red: Array.from(red), green: Array.from(green), blue: Array.from(blue) });
        };
    `;
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const workerURL = URL.createObjectURL(blob);
    histogramWorker = new Worker(workerURL);
    histogramWorker.onmessage = function(e) {
        drawHistogram(e.data);
    };
}
