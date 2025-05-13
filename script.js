document.addEventListener('DOMContentLoaded', function() {
    // Element References
    const singleMapperContainer = document.getElementById('single-mapper-container');
    const dualMapperContainer = document.getElementById('dual-mapper-container');
    const imageContainer = document.getElementById('image-container');
    const svgContainer = document.getElementById('svg-container');
    const leftImageContainer = document.getElementById('left-image-container');
    const rightImageContainer = document.getElementById('right-image-container');
    const leftSvgContainer = document.getElementById('left-svg-container');
    const rightSvgContainer = document.getElementById('right-svg-container');
    const imageUpload = document.getElementById('imageUpload');
    const opacitySlider = document.getElementById('opacitySlider');
    const mapColor = document.getElementById('mapColor');
    const mapModal = document.getElementById('mapModal');
    const mapOptions = document.getElementById('mapOptions');
    const closeBtn = document.querySelector('.close');
    const histogramCanvas = document.getElementById('histogramCanvas');
    const progressIndicator = document.getElementById('progressIndicator');
    const controls = document.querySelectorAll('.controls');
    const galleryAccordion = document.getElementById('galleryAccordion');
    const addImageBtn = document.getElementById('addImageBtn');
    const warpControlsContainer = document.getElementById('warpControlsContainer');
    const undoWarpBtn = document.getElementById('undoWarpBtn');
    const redoWarpBtn = document.getElementById('redoWarpBtn');
    const resetWarpBtn = document.getElementById('resetWarpBtn');

    let undoStack = [];
    let redoStack = [];

    const availableMaps = [
        'Angerer_Map_DE_V1',
        'Bourdiol_Map_FR_V1',
        'IrisLAB_Map_EN_V2',
        'IrisLAB_Map_FR_V2',
        'Jaussas_Map_FR_V1',
        'Jensen_Map_EN_V1',
        'Jensen_Map_FR_V1',
        'Roux_Map_FR_V1'
    ];

    const adjustmentSliders = {
        exposure: document.getElementById('exposureSlider'),
        contrast: document.getElementById('contrastSlider'),
        saturation: document.getElementById('saturationSlider'),
        hue: document.getElementById('hueSlider'),
        shadows: document.getElementById('shadowsSlider'),
        highlights: document.getElementById('highlightsSlider'),
        temperature: document.getElementById('temperatureSlider'),
        sharpness: document.getElementById('sharpnessSlider')
    };
    // Image Analysis Functions
function analyzeImageData(ctx, width, height) {
    try {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const totalPixels = width * height;

        // Initialize analysis arrays
        const histogramR = new Uint32Array(256).fill(0);
        const histogramG = new Uint32Array(256).fill(0);
        const histogramB = new Uint32Array(256).fill(0);
        const luminanceHist = new Uint32Array(256).fill(0);
        
        const colorCast = { r: 0, g: 0, b: 0 };
        let totalBrightness = 0;
        const contrastRange = { min: 255, max: 0 };

        // Single pass analysis
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Update histograms
            histogramR[r]++;
            histogramG[g]++;
            histogramB[b]++;

            // Calculate luminance
            const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            luminanceHist[luminance]++;
            totalBrightness += luminance;

            // Track contrast range
            contrastRange.min = Math.min(contrastRange.min, luminance);
            contrastRange.max = Math.max(contrastRange.max, luminance);

            // Accumulate color cast info
            colorCast.r += r;
            colorCast.g += g;
            colorCast.b += b;
        }

        // Calculate averages
        colorCast.r /= totalPixels;
        colorCast.g /= totalPixels;
        colorCast.b /= totalPixels;
        const avgBrightness = totalBrightness / totalPixels;

        // Calculate cumulative distribution
        const cdf = calculateCDF(luminanceHist, totalPixels);

        return {
            histograms: {
                r: histogramR,
                g: histogramG,
                b: histogramB,
                luminance: luminanceHist,
                red: histogramR,
                green: histogramG,
                blue: histogramB
            },
            colorCast,
            avgBrightness,
            contrastRange,
            cdf
        };
    } catch (error) {
        console.error('Error in analyzeImageData:', error);
        return null;
    }
}

function calculateCDF(histogram, totalPixels) {
    const cdf = new Uint32Array(256);
    let accumulator = 0;

    for (let i = 0; i < 256; i++) {
        accumulator += histogram[i];
        cdf[i] = (accumulator / totalPixels) * 255;
    }

    return cdf;
}

// Helper function for finding percentile points
function findPercentilePoint(cdf, percentile) {
    const targetValue = percentile * 255;
    for (let i = 0; i < cdf.length; i++) {
        if (cdf[i] >= targetValue) return i;
    }
    return 255;
}

    // State Management
    let currentEye = 'L';
    let isDualViewActive = false;
    let images = { 'L': null, 'R': null };
    let imageSettings = {
        'L': initializeEyeSettings(),
        'R': initializeEyeSettings()
    };
    let svgSettings = {
        'L': {
            svgContent: '',
            mapColor: '#000000',
            opacity: 0.7,
        },
        'R': {
            svgContent: '',
            mapColor: '#000000',
            opacity: 0.7,
        }
    };
    const resetButton = document.getElementById('resetAdjustments');
    
    // Add this with your other event listeners
    if (resetButton) {
        resetButton.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Reset button clicked');
            resetAdjustments();
        });
    }
    
    // Map Tracking
    let currentMap = 'IrisLAB_Map_EN_V2'; // Initialize with the desired default map
    let customSvgContent = ''; // To store custom SVG content

    function initializeEyeSettings() {
        return {
            rotation: 0,
            scale: 1,
            scaleX: 1,
            scaleY: 1,
            translateX: 0,
            translateY: 0,
            skewX: 0,
            skewY: 0,
            adjustments: {
                exposure: 0,
                contrast: 0,
                saturation: 0,
                hue: 0,
                shadows: 0,
                highlights: 0,
                temperature: 0,
                sharpness: 0
            },
            canvas: null,
            context: null,
            image: null,
            isAutoFitted: false
        };
    }
    

    // Histogram Data
    let histogramData = null;

function updateHistogram() {
    const settings = isDualViewActive ? imageSettings['L'] : imageSettings[currentEye];
    if (!settings.canvas) return;

    const ctx = settings.canvas.getContext('2d', { willReadFrequently: true });
    const analysis = analyzeImageData(ctx, settings.canvas.width, settings.canvas.height);

    // Store histogram data globally
    histogramData = analysis.histograms;

    // Draw updated histogram
    drawHistogram(analysis.histograms);
}

    function drawHistogram(histogramData) {
        const width = histogramCanvas.width;
        const height = histogramCanvas.height;
        const ctx = histogramCanvas.getContext('2d');

        ctx.clearRect(0, 0, width, height);

        // Draw grid for better readability
        drawGrid(ctx, width, height);

        const channels = [
            { data: histogramData.red, color: 'rgba(255,0,0,0.5)' },
            { data: histogramData.green, color: 'rgba(0,255,0,0.5)' },
            { data: histogramData.blue, color: 'rgba(0,0,255,0.5)' }
        ];

        const maxValue = Math.max(
            ...histogramData.red,
            ...histogramData.green,
            ...histogramData.blue
        );

        channels.forEach(channel => {
            ctx.beginPath();
            ctx.strokeStyle = channel.color;
            ctx.lineWidth = 1;

            for (let i = 0; i < 256; i++) {
                const x = (i / 255) * width;
                const y = height - (channel.data[i] / maxValue * height);

                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }

            ctx.stroke();
        });
    }

    function drawGrid(ctx, width, height) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;

        // Draw vertical lines
        for (let i = 0; i <= 8; i++) {
            const x = (width / 8) * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // Draw horizontal lines
        for (let i = 0; i <= 4; i++) {
            const y = (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    }

    function setupAdjustmentSliders() {
        Object.entries(adjustmentSliders).forEach(([adjustment, slider]) => {
            if (!slider) return;

            const container = slider.parentElement;
            const valueDisplay = container.querySelector('.adjustment-value');

            const debouncedUpdate = debounce(function() {
                const value = parseFloat(slider.value);
                valueDisplay.textContent = value;
            
                if (isDualViewActive) {
                    ['L', 'R'].forEach(eye => {
                        imageSettings[eye].adjustments[adjustment] = value;
                        updateCanvasImage(eye);
                    });
                } else {
                    imageSettings[currentEye].adjustments[adjustment] = value;
                    updateCanvasImage(currentEye);
                }
            }, 100); // Adjust the debounce delay as needed
            
            slider.addEventListener('input', debouncedUpdate);
            
        });
    }

    function makeElementDraggable(element) {
        let isDragging = false;
        let startX, startY;
        let initialX, initialY;

        element.addEventListener('pointerdown', function(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') {
                return;
            }
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = element.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            element.style.cursor = 'grabbing';
        });

        document.addEventListener('pointermove', function(e) {
            if (!isDragging) return;
            e.preventDefault();
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            element.style.left = `${initialX + dx}px`;
            element.style.top = `${initialY + dy}px`;
        });

        document.addEventListener('pointerup', function() {
            if (isDragging) {
                isDragging = false;
                element.style.cursor = 'move';
            }
        });
    }

    function setupImageInteraction(canvas, eye) {
        let isDragging = false;
        let isRotating = false;
        let startX, startY;
        let startTranslateX, startTranslateY;
        let startRotation = 0;

        let activeHandle = null; // For stretch handles
        let initialMouseX, initialMouseY; 
        let initialScaleX, initialScaleY;
        let initialTranslateX_Handle, initialTranslateY_Handle; // Renamed to avoid conflict
        let initialImgNaturalWidth, initialImgNaturalHeight;

        canvas.style.cursor = 'grab';

        // Helper function for stretch handles
        function getHandleAtPoint(canvasElementMouseX, canvasElementMouseY, currentEyeSettings) {
            if (!currentEyeSettings || !currentEyeSettings.canvas || !currentEyeSettings.image || !isImagePositionLocked) return null;

            const img = currentEyeSettings.image;
            const imgBaseWidth = img.naturalWidth;
            const imgBaseHeight = img.naturalHeight;
            
            // Mouse coords relative to the canvas element origin (top-left)
            // Handles are drawn in the image's natural coordinate system on the canvas context.
            // The canvas element itself is scaled by CSS transform (settings.scaleX, settings.scaleY).
            // So, to check for hits, we need to convert mouse point from canvas element space
            // to the image's internal drawing space (scaled by 1/settings.scaleX, 1/settings.scaleY).
            const mouseXInImageNaturalSpace = canvasElementMouseX / currentEyeSettings.scaleX;
            const mouseYInImageNaturalSpace = canvasElementMouseY / currentEyeSettings.scaleY;

            const avgScale = (currentEyeSettings.scaleX + currentEyeSettings.scaleY) / 2;
            const safeAvgScale = Math.max(0.1, avgScale); 
            const effectiveHandleSizeInImageNaturalSpace = HANDLE_SIZE / safeAvgScale; 

            const handlesPositions = {
                tl: { x: 0, y: 0 }, tm: { x: imgBaseWidth / 2, y: 0 }, tr: { x: imgBaseWidth, y: 0 },
                lm: { x: 0, y: imgBaseHeight / 2 }, rm: { x: imgBaseWidth, y: imgBaseHeight / 2 },
                bl: { x: 0, y: imgBaseHeight }, bm: { x: imgBaseWidth / 2, y: imgBaseHeight }, br: { x: imgBaseWidth, y: imgBaseHeight }
            };

            for (const key in handlesPositions) {
                const pos = handlesPositions[key];
                const handleRect = {
                    left: pos.x - effectiveHandleSizeInImageNaturalSpace / 2,
                    top: pos.y - effectiveHandleSizeInImageNaturalSpace / 2,
                    right: pos.x + effectiveHandleSizeInImageNaturalSpace / 2,
                    bottom: pos.y + effectiveHandleSizeInImageNaturalSpace / 2
                };

                if (mouseXInImageNaturalSpace >= handleRect.left && mouseXInImageNaturalSpace <= handleRect.right &&
                    mouseYInImageNaturalSpace >= handleRect.top && mouseYInImageNaturalSpace <= handleRect.bottom) {
                    return key; 
                }
            }
            return null;
        }

        function handleDragStart(e) {
            const settings = imageSettings[eye]; // Moved up to be accessible for handle logic
            if (!settings || !settings.image) return; // Ensure settings and image exist

            if (isImagePositionLocked) {
                const rect = canvas.getBoundingClientRect();
                // Mouse position relative to the canvas element's top-left origin
                const mouseCanvasX = e.clientX - rect.left;
                const mouseCanvasY = e.clientY - rect.top;
                
                activeHandle = getHandleAtPoint(mouseCanvasX, mouseCanvasY, settings);

                if (activeHandle) {
            e.preventDefault();
                    e.stopPropagation();
                    isDragging = true; // Use existing flag, signifies any kind of drag on canvas
                    canvas.style.cursor = 'grabbing';
                    
                    initialMouseX = e.clientX;
                    initialMouseY = e.clientY;
                    initialScaleX = settings.scaleX;
                    initialScaleY = settings.scaleY;
                    initialTranslateX_Handle = settings.translateX; // Store initial translate for anchor calculations
                    initialTranslateY_Handle = settings.translateY;
                    initialImgNaturalWidth = settings.image.naturalWidth;
                    initialImgNaturalHeight = settings.image.naturalHeight;
                    // console.log('Starting drag on handle:', activeHandle);
                    return; // Crucial: stop further processing in handleDragStart if handle is active
                }
                // If no handle is active but image is locked, pan is already prevented by earlier logic. So, do nothing more here.
            }
            
            // Existing pan/rotate logic (only runs if not locked or no handle was grabbed when locked)
            e.preventDefault(); // Keep this for general canvas interaction prevention
            if (e.button === 2) { // Right-click for rotation
                isRotating = true;
                startX = e.clientX;
                startRotation = settings.rotation;
            } else if (e.button === 0) { // Left-click for dragging (panning)
                // This pan logic is now effectively conditional due to the isImagePositionLocked check earlier in the main function
                // and the activeHandle check specific to isImagePositionLocked case above.
                if (isImagePositionLocked) return; // Double-check to prevent pan if somehow reached here while locked
                
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                startTranslateX = settings.translateX;
                startTranslateY = settings.translateY;
            }
            canvas.style.cursor = isRotating ? 'crosshair' : (isDragging ? 'grabbing' : 'grab');
        }

        function handleDragMove(e) {
            const currentSettings = imageSettings[eye]; // Get current settings
            if (!currentSettings || !currentSettings.image) return;

            if (isDragging && activeHandle && isImagePositionLocked) {
                e.preventDefault();
                e.stopPropagation();
                canvas.style.cursor = 'grabbing';
                // --- Stretch logic ---
                // Calculate mouse delta in canvas element space
                const dx = e.clientX - initialMouseX;
                const dy = e.clientY - initialMouseY;
                let newScaleX = initialScaleX;
                let newScaleY = initialScaleY;
                let newTranslateX = initialTranslateX_Handle;
                let newTranslateY = initialTranslateY_Handle;
                const imgW = initialImgNaturalWidth;
                const imgH = initialImgNaturalHeight;

                // For each handle, determine which axes to stretch and which corner/side to anchor
                // tl: anchor br, tr: anchor bl, bl: anchor tr, br: anchor tl
                // tm: anchor bm, bm: anchor tm, lm: anchor rm, rm: anchor lm
                // We'll use the sign of dx/dy to determine stretch direction
                switch (activeHandle) {
                    case 'tr': // Top-right, anchor bottom-left
                        newScaleX = Math.max(0.1, initialScaleX + dx / imgW);
                        newScaleY = Math.max(0.1, initialScaleY - dy / imgH);
                        // Adjust translation so bottom-left stays put
                        newTranslateX = initialTranslateX_Handle - (imgW * (newScaleX - initialScaleX)) / 2;
                        newTranslateY = initialTranslateY_Handle + (imgH * (newScaleY - initialScaleY)) / 2;
                        break;
                    case 'tl': // Top-left, anchor bottom-right
                        newScaleX = Math.max(0.1, initialScaleX - dx / imgW);
                        newScaleY = Math.max(0.1, initialScaleY - dy / imgH);
                        newTranslateX = initialTranslateX_Handle + (imgW * (newScaleX - initialScaleX)) / 2;
                        newTranslateY = initialTranslateY_Handle + (imgH * (newScaleY - initialScaleY)) / 2;
                        break;
                    case 'bl': // Bottom-left, anchor top-right
                        newScaleX = Math.max(0.1, initialScaleX - dx / imgW);
                        newScaleY = Math.max(0.1, initialScaleY + dy / imgH);
                        newTranslateX = initialTranslateX_Handle + (imgW * (newScaleX - initialScaleX)) / 2;
                        newTranslateY = initialTranslateY_Handle - (imgH * (newScaleY - initialScaleY)) / 2;
                        break;
                    case 'br': // Bottom-right, anchor top-left
                        newScaleX = Math.max(0.1, initialScaleX + dx / imgW);
                        newScaleY = Math.max(0.1, initialScaleY + dy / imgH);
                        newTranslateX = initialTranslateX_Handle - (imgW * (newScaleX - initialScaleX)) / 2;
                        newTranslateY = initialTranslateY_Handle - (imgH * (newScaleY - initialScaleY)) / 2;
                        break;
                    case 'tm': // Top-middle, anchor bottom-middle
                        newScaleY = Math.max(0.1, initialScaleY - dy / imgH);
                        newTranslateY = initialTranslateY_Handle + (imgH * (newScaleY - initialScaleY)) / 2;
                        break;
                    case 'bm': // Bottom-middle, anchor top-middle
                        newScaleY = Math.max(0.1, initialScaleY + dy / imgH);
                        newTranslateY = initialTranslateY_Handle - (imgH * (newScaleY - initialScaleY)) / 2;
                        break;
                    case 'lm': // Left-middle, anchor right-middle
                        newScaleX = Math.max(0.1, initialScaleX - dx / imgW);
                        newTranslateX = initialTranslateX_Handle + (imgW * (newScaleX - initialScaleX)) / 2;
                        break;
                    case 'rm': // Right-middle, anchor left-middle
                        newScaleX = Math.max(0.1, initialScaleX + dx / imgW);
                        newTranslateX = initialTranslateX_Handle - (imgW * (newScaleX - initialScaleX)) / 2;
                        break;
                }
                currentSettings.scaleX = Math.min(10, newScaleX);
                currentSettings.scaleY = Math.min(10, newScaleY);
                currentSettings.translateX = newTranslateX;
                currentSettings.translateY = newTranslateY;
                updateCanvasTransform(eye);
                return; // Done with handle move
            }
            
            // Existing rotation and pan logic
            if (!isDragging && !isRotating) {
                 // Handle cursor change on hover when not dragging anything
                if (isImagePositionLocked) {
                    const rect = canvas.getBoundingClientRect();
                    const mouseCanvasX = e.clientX - rect.left;
                    const mouseCanvasY = e.clientY - rect.top;
                    const hoveredHandle = getHandleAtPoint(mouseCanvasX, mouseCanvasY, currentSettings);
                    canvas.style.cursor = hoveredHandle ? 'grab' : 'default'; // 'default' or 'not-allowed'
                } else {
                    // canvas.style.cursor = 'grab'; // Already set or handled by dragStart/End
                }
                return;
            }
            e.preventDefault();

            if (isRotating) {
                const dx = e.clientX - startX;
                currentSettings.rotation = startRotation + dx * 0.5;
                updateCanvasTransform(eye);
            } else if (isDragging) { // This implies general canvas drag (pan) or previously non-handled handle drag
                if (isImagePositionLocked) return; // Should not pan if locked
                
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                currentSettings.translateX = startTranslateX + dx;
                currentSettings.translateY = startTranslateY + dy;
                updateCanvasTransform(eye);
            }
        }

        function handleDragEnd() {
            if (isDragging && activeHandle && isImagePositionLocked) {
                // console.log(`Finished dragging handle: ${activeHandle}`);
                // Finalize stretch, if any debouncing or state commit is needed later
            }
            
                isDragging = false;
                isRotating = false;
            activeHandle = null;
            
            // Determine cursor after drag ends
            if (isImagePositionLocked) {
                // Check if mouse is now over a handle to set to 'grab', otherwise 'default'
                // This requires knowing current mouse position, which isn't directly available in dragend.
                // A simple solution is to set to default and let next mousemove handle hover.
                canvas.style.cursor = 'default'; 
            } else {
                canvas.style.cursor = 'grab';
            }
        }

        function handleWheel(e) {
            e.preventDefault();
            const delta = e.deltaY * -0.0005;
            const settings = imageSettings[eye]; // 'eye' is from the setupImageInteraction scope
            const zoomMultiplier = Math.exp(delta);

            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            let newScaleX, newScaleY;

            if (isImagePositionLocked) {
                newScaleX = settings.scaleX * zoomMultiplier;
                newScaleY = settings.scaleY * zoomMultiplier;
            } else {
                const newUniformScale = settings.scale * zoomMultiplier;
                newScaleX = newUniformScale;
                newScaleY = newUniformScale;
                settings.scale = Math.max(0.1, Math.min(10, newUniformScale)); // Update base scale
            }

            newScaleX = Math.max(0.1, Math.min(10, newScaleX));
            newScaleY = Math.max(0.1, Math.min(10, newScaleY));
            
            const scaleChangeX = newScaleX / settings.scaleX;
            const scaleChangeY = newScaleY / settings.scaleY;

            // Adjust translation to zoom towards mouse pointer
            // This needs to be thought through carefully for non-uniform scaling if desired
            // For now, let's assume it scales relative to the current center for simplicity when locked, or adjust based on X for uniform
            if (!isImagePositionLocked || (scaleChangeX === scaleChangeY)) { // Uniform or locked uniform zoom
                 settings.translateX = x - (x - settings.translateX) * scaleChangeX; 
                 settings.translateY = y - (y - settings.translateY) * (isImagePositionLocked ? scaleChangeX : scaleChangeY); // use scaleChangeX for locked uniform
            } else {
                // For non-uniform stretch zoom from center, translateX/Y might not change, or change differently
                // This part might need more sophisticated handling if zooming into pointer with non-uniform scale is a hard requirement.
                // Defaulting to centered zoom for now when stretch-zooming non-uniformly.
            }

            settings.scaleX = newScaleX;
            settings.scaleY = newScaleY;

            updateCanvasTransform(eye);
        }

        canvas.addEventListener('pointerdown', handleDragStart);
        canvas.addEventListener('pointermove', handleDragMove);
        canvas.addEventListener('pointerup', handleDragEnd);
        canvas.addEventListener('pointerleave', handleDragEnd);
        canvas.addEventListener('wheel', handleWheel, { passive: false });
        canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    function createCanvasForEye(eye) {
        const settings = imageSettings[eye];
        if (!settings.image) return;

        if (settings.canvas) {
            settings.canvas.remove();
        }

        settings.canvas = document.createElement('canvas');
        settings.context = settings.canvas.getContext('2d', { willReadFrequently: true });
        settings.canvas.className = 'image-canvas';
        settings.canvas.width = settings.image.naturalWidth;
        settings.canvas.height = settings.image.naturalHeight;
        settings.canvas.style.position = 'absolute';
        settings.canvas.style.top = '50%';
        settings.canvas.style.left = '50%';
        settings.canvas.style.transform = 'translate(-50%, -50%)';
        setupImageInteraction(settings.canvas, eye);
        setupMeshPointDragging(settings.canvas, eye);
    }

    // Helper: Get pixel data using bilinear interpolation
    function getInterpolatedPixel(imageData, x, y) {
        const w = imageData.width;
        const h = imageData.height;
        const x_floor = Math.floor(x);
        const y_floor = Math.floor(y);
        const x_ceil = Math.min(w - 1, x_floor + 1);
        const y_ceil = Math.min(h - 1, y_floor + 1);

        if (x_floor < 0 || x_floor >= w || y_floor < 0 || y_floor >= h) {
            return [0, 0, 0, 0]; // Out of bounds, return transparent black
        }

        const dx = x - x_floor;
        const dy = y - y_floor;

        const p1_offset = (y_floor * w + x_floor) * 4;
        const p2_offset = (y_floor * w + x_ceil) * 4;
        const p3_offset = (y_ceil * w + x_floor) * 4;
        const p4_offset = (y_ceil * w + x_ceil) * 4;
        const data = imageData.data;

        const interpolatedPixel = [0, 0, 0, 0];
        for (let i = 0; i < 4; i++) { // r, g, b, a
            const val1 = data[p1_offset + i] * (1 - dx) + data[p2_offset + i] * dx;
            const val2 = data[p3_offset + i] * (1 - dx) + data[p4_offset + i] * dx;
            interpolatedPixel[i] = val1 * (1 - dy) + val2 * dy;
        }
        return interpolatedPixel;
    }

    // Helper: Inverse bilinear interpolation for a point within a quad
    // Given a point (x, y) inside the destination quad defined by p1, p2, p3, p4,
    // find the normalized coordinates (s, t) within that quad.
    // p1=(x0,y0) top-left, p2=(x1,y0) top-right, p3=(x0,y1) bottom-left, p4=(x1,y1) bottom-right (in source)
    // Here, p1-p4 are the *actual* coordinates of the mesh points defining the DESTINATION quad.
    function inverseBilinearInterpolation(x, y, p1, p2, p3, p4) {
        // --- Simplified Linear Approximation --- 
        // This is less accurate for non-rectangular quads but more stable than the previous solver.
        let s = 0, t = 0;
        
        // Approximate s based on horizontal position relative to top edge points
        const topWidth = p2.x - p1.x;
        if (Math.abs(topWidth) > 1e-6) {
            s = (x - p1.x) / topWidth;
        } else {
            // Fallback: Estimate based on bottom edge or average?
             const bottomWidth = p4.x - p3.x;
             if (Math.abs(bottomWidth) > 1e-6) {
                 s = (x - p3.x) / bottomWidth;
             } else {
                 s = 0; // Degenerate case
             }
        }

        // Approximate t based on vertical position relative to left edge points
        const leftHeight = p3.y - p1.y;
         if (Math.abs(leftHeight) > 1e-6) {
            t = (y - p1.y) / leftHeight;
        } else {
             // Fallback: Estimate based on right edge or average?
             const rightHeight = p4.y - p2.y;
             if (Math.abs(rightHeight) > 1e-6) {
                 t = (y - p2.y) / rightHeight;
             } else {
                 t = 0; // Degenerate case
             }
        }

        // Clamp results to [0, 1] range
        s = Math.max(0, Math.min(1, s));
        t = Math.max(0, Math.min(1, t));

        return { s, t };
        // --- End Simplified Linear Approximation ---
    }

    // Function to draw the warped image based on mesh points
    function drawWarpedImage(ctx, srcImageData, meshPoints) {
        const destWidth = ctx.canvas.width;
        const destHeight = ctx.canvas.height;
        const destImageData = ctx.createImageData(destWidth, destHeight);
        const destData = destImageData.data;

        const rows = meshPoints.length - 1;
        const cols = meshPoints[0].length - 1;
        const srcWidth = srcImageData.width;
        const srcHeight = srcImageData.height;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                // Get the four corner points of the destination quad
                const p1_dest = meshPoints[r][c];     // top-left
                const p2_dest = meshPoints[r][c + 1];   // top-right
                const p3_dest = meshPoints[r + 1][c];   // bottom-left
                const p4_dest = meshPoints[r + 1][c + 1]; // bottom-right

                // Get the four corner points of the corresponding source quad (always rectangular)
                const p1_src = { x: (srcWidth / cols) * c, y: (srcHeight / rows) * r };
                const p2_src = { x: (srcWidth / cols) * (c + 1), y: (srcHeight / rows) * r };
                const p3_src = { x: (srcWidth / cols) * c, y: (srcHeight / rows) * (r + 1) };
                const p4_src = { x: (srcWidth / cols) * (c + 1), y: (srcHeight / rows) * (r + 1) };

                // Estimate bounds of the destination quad for iteration
                const minX = Math.floor(Math.min(p1_dest.x, p2_dest.x, p3_dest.x, p4_dest.x));
                const maxX = Math.ceil(Math.max(p1_dest.x, p2_dest.x, p3_dest.x, p4_dest.x));
                const minY = Math.floor(Math.min(p1_dest.y, p2_dest.y, p3_dest.y, p4_dest.y));
                const maxY = Math.ceil(Math.max(p1_dest.y, p2_dest.y, p3_dest.y, p4_dest.y));

                // Iterate over pixels within the bounding box of the destination quad
                for (let y = Math.max(0, minY); y < Math.min(destHeight, maxY); y++) {
                    for (let x = Math.max(0, minX); x < Math.min(destWidth, maxX); x++) {
                        
                        // Check if pixel (x,y) is roughly inside the quad (optional optimization)
                        // A more robust check involves point-in-polygon test

                        // Find normalized coordinates (s, t) within the destination quad
                        const { s, t } = inverseBilinearInterpolation(x, y, p1_dest, p2_dest, p3_dest, p4_dest);
                        
                        // Use (s, t) to find the corresponding absolute coordinates (srcX, srcY) in the source quad
                        const srcX = p1_src.x * (1 - s) * (1 - t) + p2_src.x * s * (1 - t) + p3_src.x * (1 - s) * t + p4_src.x * s * t;
                        const srcY = p1_src.y * (1 - s) * (1 - t) + p2_src.y * s * (1 - t) + p3_src.y * (1 - s) * t + p4_src.y * s * t;

                        // Get the interpolated pixel color from the source image
                        const pixelData = getInterpolatedPixel(srcImageData, srcX, srcY);

                        // Set the pixel data in the destination image data
                        const destOffset = (y * destWidth + x) * 4;
                        destData[destOffset] = pixelData[0];     // R
                        destData[destOffset + 1] = pixelData[1]; // G
                        destData[destOffset + 2] = pixelData[2]; // B
                        destData[destOffset + 3] = pixelData[3]; // A
                    }
                }
            }
        }
        // Draw the warped image data onto the canvas
        ctx.putImageData(destImageData, 0, 0);
    }

    function updateCanvasImage(eye) {
        const settings = imageSettings[eye];
        if (!settings.canvas || !settings.context || !settings.image) return;
    
        // Use offscreen canvas for filters
        if (!settings.offscreenCanvas) {
            settings.offscreenCanvas = new OffscreenCanvas(
                settings.image.naturalWidth,
                settings.image.naturalHeight
            );
            settings.offscreenCtx = settings.offscreenCanvas.getContext('2d', {
                willReadFrequently: true
            });
        }
    
        const ctx = settings.context; // Destination canvas context
        const offCtx = settings.offscreenCtx; // Offscreen (source for warp) context
        const canvas = settings.canvas;
        const img = settings.image; // Original image
        const width = img.naturalWidth;
        const height = img.naturalHeight;
    
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            settings.offscreenCanvas.width = width;
            settings.offscreenCanvas.height = height;
        }
    
        offCtx.clearRect(0, 0, width, height);
        offCtx.save();
    
        // Apply filters to offscreen canvas
        const filters = [
            `brightness(${(100 + settings.adjustments.exposure) / 100})`,
            `contrast(${(100 + settings.adjustments.contrast) / 100})`,
            `saturate(${(100 + settings.adjustments.saturation) / 100})`,
            `hue-rotate(${settings.adjustments.hue}deg)`
        ];
        if (settings.adjustments.temperature !== 0) {
            const temp = settings.adjustments.temperature;
            const warmFilter = temp > 0 ? `sepia(${temp}%)` : '';
            const coolFilter = temp < 0 ? `hue-rotate(180deg) saturate(${Math.abs(temp)}%)` : '';
            filters.push(warmFilter || coolFilter);
        }
        offCtx.filter = filters.join(' ');
    
        // Draw original image to offscreen
        offCtx.drawImage(img, 0, 0, width, height);
        offCtx.restore(); // Filters are applied by drawImage
        offCtx.filter = 'none'; // Reset filter for potential direct manipulations later

        // Apply adjustments like shadows/highlights, sharpness to offscreen data
        if (settings.adjustments.shadows !== 0 || settings.adjustments.highlights !== 0) {
            // Need to re-implement applyShadowsHighlights to work with OffscreenCanvas/Context
            // For now, skip these if warping is active?
            // Alternatively, get/put ImageData from offCtx, modify, put back.
            console.warn("Shadows/Highlights adjustment during warp not fully implemented yet.");
        }
        if (settings.adjustments.sharpness !== 0) {
             applySharpness(offCtx, settings.adjustments.sharpness); // Assuming this modifies offCtx directly
        }

        requestAnimationFrame(() => {
            ctx.clearRect(0, 0, width, height);

            // === WARPING LOGIC ===
            if (meshPoints[eye]) {
                try {
                    // Get the ImageData from the offscreen canvas (which has filters applied)
                    const sourceImageData = offCtx.getImageData(0, 0, width, height); 
                    // Draw the warped image onto the main context
                    drawWarpedImage(ctx, sourceImageData, meshPoints[eye]);
                } catch (error) {
                    console.error("Error during image warping:", error);
                    // Fallback: draw the unwarped image from offscreen canvas
                    ctx.drawImage(settings.offscreenCanvas, 0, 0);
                }
            } else {
                // === ORIGINAL DRAWING LOGIC ===
                // Draw the (filtered, adjusted) image from the offscreen canvas to the main canvas
                ctx.drawImage(settings.offscreenCanvas, 0, 0); 
            }
            // ======================
            
            // Draw resize handles OR warp grid on top
            if (isImagePositionLocked) {
                if (warpModeActive) {
                    drawWarpGrid(eye); // Draw grid on top of warped image
                } else {
                    drawResizeHandles(eye); // Draw handles if locked but not warping
                }
            }
            
            // Update CSS transform for pan/zoom/rotate (applies to the canvas element)
            updateCanvasTransform(eye);
            
            // Debounce histogram update
            if (!settings.histogramTimeout) {
                settings.histogramTimeout = setTimeout(() => {
                    updateHistogram(); // Consider if histogram should use warped or original data
                    settings.histogramTimeout = null;
                }, 100);
            }
        });
    }

    function applyShadowsHighlights(ctx, img, settings) {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        
        // Draw original image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
    
        // Calculate adjustments
        const shadows = settings.adjustments.shadows / 100;
        const highlights = settings.adjustments.highlights / 100;
    
        // Loop through pixels
        for (let i = 0; i < data.length; i += 4) {
            // Calculate luminance
            const luminance = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
    
            if (luminance < 128) {
                // Shadows adjustment
                const factor = 1 + shadows;
                data[i] *= factor;
                data[i+1] *= factor;
                data[i+2] *= factor;
            } else {
                // Highlights adjustment
                const factor = 1 - highlights;
                data[i] *= factor;
                data[i+1] *= factor;
                data[i+2] *= factor;
            }
        }
    
        // Put adjusted data back
        ctx.putImageData(imageData, 0, 0);
    }
    
    

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
    
        if(max === min){
            h = s = 0; // achromatic
        } else {
            let d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch(max){
                case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
                case g: h = ((b - r) / d + 2); break;
                case b: h = ((r - g) / d + 4); break;
            }
            h /= 6;
        }
    
        return [h, s, l];
    }
    
    function hslToRgb(h, s, l){
        let r, g, b;
    
        if(s === 0){
            r = g = b = l; // achromatic
        } else {
            function hue2rgb(p, q, t){
                if(t < 0) t += 1;
                if(t > 1) t -= 1;
                if(t < 1/6) return p + (q - p) * 6 * t;
                if(t < 1/2) return q;
                if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            }
    
            let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            let p = 2 * l - q;
    
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
    
        return [r * 255, g * 255, b * 255];
    }

    function applyCustomAdjustments(ctx, eye, settings) {
        // Implement sharpness using convolution filter
        if (settings.adjustments.sharpness !== 0) {
            const amount = settings.adjustments.sharpness / 100;
            const width = ctx.canvas.width;
            const height = ctx.canvas.height;
            const imageData = ctx.getImageData(0, 0, width, height);

            const weights = [
                0, -1 * amount, 0,
                -1 * amount, 4 * amount + 1, -1 * amount,
                0, -1 * amount, 0
            ];

            convolve(imageData, weights);
            ctx.putImageData(imageData, 0, 0);
        }
    }

    function convolve(imageData, weights) {
        const pixels = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const side = Math.round(Math.sqrt(weights.length));
        const halfSide = Math.floor(side / 2);

        const output = new Uint8ClampedArray(pixels.length);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let r = 0, g = 0, b = 0;
                for (let cy = 0; cy < side; cy++) {
                    for (let cx = 0; cx < side; cx++) {
                        const scy = y + cy - halfSide;
                        const scx = x + cx - halfSide;
                        if (scy >= 0 && scy < height && scx >= 0 && scx < width) {
                            const offset = (scy * width + scx) * 4;
                            const wt = weights[cy * side + cx];
                            r += pixels[offset] * wt;
                            g += pixels[offset + 1] * wt;
                            b += pixels[offset + 2] * wt;
                        }
                    }
                }
                const offset = (y * width + x) * 4;
                output[offset] = r;
                output[offset + 1] = g;
                output[offset + 2] = b;
                output[offset + 3] = pixels[offset + 3];
            }
        }
        imageData.data.set(output);
    }

    function updateCanvasTransform(eye) {
        const settings = imageSettings[eye];
        if (!settings.canvas) return;

        settings.canvas.style.transform = `
            translate(-50%, -50%)
            translate(${settings.translateX}px, ${settings.translateY}px)
            rotate(${settings.rotation}deg)
            scale(${settings.scaleX}, ${settings.scaleY})
            skew(${settings.skewX}deg, ${settings.skewY}deg)
        `;
    }

    function loadImageForSpecificEye(eye) {
        const container = isDualViewActive ? 
            (eye === 'L' ? leftImageContainer : rightImageContainer) : imageContainer;
        
        if (!container) return;
        
        container.innerHTML = '';
        const settings = imageSettings[eye];
        
        if (settings.canvas) {
            container.appendChild(settings.canvas);
            autoFitImage(settings);
            updateCanvasImage(eye);
        }
    }

    function autoFitImage(settings) {
        if (!settings.image) return;

        if (settings.isAutoFitted) return;

        const containerWidth = window.innerWidth;
        const containerHeight = window.innerHeight;
        const imageWidth = settings.image.naturalWidth;
        const imageHeight = settings.image.naturalHeight;

        const scaleX = containerWidth / imageWidth;
        const scaleY = containerHeight / imageHeight;
        const scale = Math.min(scaleX, scaleY) * 0.8;

        settings.scale = scale;
        settings.translateX = 0;
        settings.translateY = 0;
        settings.rotation = 0;

        updateCanvasTransform(currentEye);

        settings.isAutoFitted = true;
    }


    
    // Replace your existing resetAdjustments function with this updated version
    function resetAdjustments() {
        console.log('Reset function called'); // Debug log
    
        const defaultAdjustments = {
            exposure: 0,
            contrast: 0,
            saturation: 0,
            hue: 0,
            shadows: 0,
            highlights: 0,
            temperature: 0,
            sharpness: 0
        };
    
        const eyesToReset = isDualViewActive ? ['L', 'R'] : [currentEye];
        console.log('Resetting eyes:', eyesToReset); // Debug log
    
        eyesToReset.forEach(eye => {
            // Reset histogram-related adjustments
            imageSettings[eye].adjustments = { 
                ...imageSettings[eye].adjustments,
                ...defaultAdjustments
            };

            // Reset transformations
            imageSettings[eye].scale = 1;
            imageSettings[eye].scaleX = 1;
            imageSettings[eye].scaleY = 1;
            imageSettings[eye].rotation = 0;
            imageSettings[eye].translateX = 0;
            imageSettings[eye].translateY = 0;
            imageSettings[eye].isAutoFitted = false; // Allow autoFit again if needed

            // === ADDED: Reset warp data ===
            const storageKey = `warpPoints_${eye}`;
            localStorage.removeItem(storageKey);
            meshPoints[eye] = null; // Clear in-memory points
            console.log(`Cleared saved warp points for eye ${eye}`);
            // === END ADDED ===
    
            // Clear undo/redo stacks for warp
            undoStack = [];
            redoStack = [];
            updateWarpActionButtons(); // Update button states
    
            // Update UI sliders
            Object.entries(adjustmentSliders).forEach(([adjustment, slider]) => {
                if (!slider) return;
                
                // Only reset sliders that are in defaultAdjustments
                if (defaultAdjustments.hasOwnProperty(adjustment)) {
                    slider.value = 0;
                    // Update value display
                    const valueDisplay = slider.parentElement?.querySelector('.adjustment-value');
                    if (valueDisplay) {
                        valueDisplay.textContent = '0';
                    }
                }
            });
    
            // Clear any pending timeouts
            if (imageSettings[eye].histogramTimeout) {
                clearTimeout(imageSettings[eye].histogramTimeout);
                imageSettings[eye].histogramTimeout = null;
            }
    
            // Update canvas display
            if (imageSettings[eye].canvas && imageSettings[eye].image) {
                requestAnimationFrame(() => {
                    autoFitImage(imageSettings[eye]); // Re-apply auto-fit after reset
                    updateCanvasImage(eye); // Then update with adjustments (which are now reset)
                });
            }
        });
    
        // Update histogram after reset
        setTimeout(updateHistogram, 100);
    }
    

    function switchEye(eye) {
        if (currentEye === eye) return;
        
        currentEye = eye;
        loadSVG(currentMap, eye);
        loadImageForSpecificEye(eye);
        updateSVGContainers(eye);
        
        if (opacitySlider) {
            opacitySlider.value = svgSettings[eye].opacity;
        }
        if (mapColor) {
            mapColor.value = svgSettings[eye].mapColor;
        }
        
        Object.entries(adjustmentSliders).forEach(([adjustment, slider]) => {
            if (!slider) return;
            
            const value = imageSettings[eye].adjustments[adjustment];
            slider.value = value;
            const valueDisplay = slider.parentElement.querySelector('.adjustment-value');
            if (valueDisplay) {
                valueDisplay.textContent = value;
            }
        });
    }

    function toggleDualView() {
        isDualViewActive = !isDualViewActive;
        
        if (isDualViewActive) {
            singleMapperContainer.style.display = 'none';
            dualMapperContainer.style.display = 'flex';
            
            ['L', 'R'].forEach(eye => {
                if (imageSettings[eye].image) {
                    loadSVG(currentMap, eye);
                    updateSVGContainers(eye);
                    loadImageForSpecificEye(eye);
                }
            });
        } else {
            dualMapperContainer.style.display = 'none';
            singleMapperContainer.style.display = 'block';
            
            loadSVG(currentMap, currentEye);
            updateSVGContainers(currentEye);
            loadImageForSpecificEye(currentEye);
        }

        if (isDualViewActive) {
            ['L', 'R'].forEach(eye => {
                if (imageSettings[eye].canvas) updateCanvasImage(eye);
            });
        } else {
            if (imageSettings[currentEye].canvas) updateCanvasImage(currentEye);
        }
        updateHistogram();
    }

    function updateSVGContainers(eye) {
        if (isDualViewActive) {
            if (eye === 'L') {
                if (leftSvgContainer) {
                    leftSvgContainer.style.opacity = svgSettings['L'].opacity;
                    changeMapColor(svgSettings['L'].mapColor, 'L');
                }
            } else if (eye === 'R') {
                if (rightSvgContainer) {
                    rightSvgContainer.style.opacity = svgSettings['R'].opacity;
                    changeMapColor(svgSettings['R'].mapColor, 'R');
                }
            }
        } else {
            if (svgContainer) {
                svgContainer.style.opacity = svgSettings[currentEye].opacity;
                changeMapColor(svgSettings[currentEye].mapColor, currentEye);
            }
        }
    }

    // Event Listeners for Eye Buttons
    document.getElementById('leftEye')?.addEventListener('click', () => {
        if (isDualViewActive) {
            isDualViewActive = false;
            currentEye = 'L';
            
            const btns = document.querySelectorAll('.eye-btn');
            btns.forEach(btn => btn.classList.remove('active'));
            document.getElementById('leftEye').classList.add('active');
            
            dualMapperContainer.style.display = 'none';
            singleMapperContainer.style.display = 'block';
            
            loadSVG(currentMap, 'L');
            updateSVGContainers('L');
            loadImageForSpecificEye('L');
        } else {
            switchEye('L');
            const btns = document.querySelectorAll('.eye-btn');
            btns.forEach(btn => btn.classList.remove('active'));
            document.getElementById('leftEye').classList.add('active');
        }
    });

    document.getElementById('rightEye')?.addEventListener('click', () => {
        if (isDualViewActive) {
            isDualViewActive = false;
            currentEye = 'R';
            
            const btns = document.querySelectorAll('.eye-btn');
            btns.forEach(btn => btn.classList.remove('active'));
            document.getElementById('rightEye').classList.add('active');
            
            dualMapperContainer.style.display = 'none';
            singleMapperContainer.style.display = 'block';
            
            loadSVG(currentMap, 'R');
            updateSVGContainers('R');
            loadImageForSpecificEye('R');
        } else {
            switchEye('R');
            const btns = document.querySelectorAll('.eye-btn');
            btns.forEach(btn => btn.classList.remove('active'));
            document.getElementById('rightEye').classList.add('active');
        }
    });

    document.getElementById('bothEyes')?.addEventListener('click', function() {
        toggleDualView();
        
        const btns = document.querySelectorAll('.eye-btn');
        btns.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
    });

    // Save functionality
    document.getElementById('save')?.addEventListener('click', () => {
        const containerToCapture = isDualViewActive ? dualMapperContainer : singleMapperContainer;
        if (!containerToCapture) return;

        progressIndicator.style.display = 'flex';

        setTimeout(() => {
            html2canvas(containerToCapture, {
                useCORS: true,
                allowTaint: false,
                backgroundColor: null,
                scale: 2,
                width: containerToCapture.offsetWidth,
                height: containerToCapture.offsetHeight,
                windowWidth: containerToCapture.scrollWidth,
                windowHeight: containerToCapture.scrollHeight,
            }).then(canvas => {
                const link = document.createElement('a');
                link.download = `iris_map_${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                progressIndicator.style.display = 'none';
            }).catch(error => {
                console.error('Error saving image:', error);
                alert('Failed to save the image. Please try again.');
                progressIndicator.style.display = 'none';
            });
        }, 100);
    });

    // SVG and opacity controls
    opacitySlider?.addEventListener('input', function() {
        const newOpacity = parseFloat(this.value);
        if (isDualViewActive) {
            leftSvgContainer.style.opacity = newOpacity;
            rightSvgContainer.style.opacity = newOpacity;
            svgSettings['L'].opacity = newOpacity;
            svgSettings['R'].opacity = newOpacity;
        } else {
            svgContainer.style.opacity = newOpacity;
            svgSettings[currentEye].opacity = newOpacity;
        }
    });

    mapColor?.addEventListener('input', function() {
        const newColor = this.value;
        if (isDualViewActive) {
            changeMapColor(newColor, 'L');
            changeMapColor(newColor, 'R');
        } else {
            changeMapColor(newColor, currentEye);
        }
    });

    // Map selection modal
    document.getElementById('selectMap')?.addEventListener('click', () => {
        if (!mapModal || !mapOptions) return;
        
        mapModal.style.display = 'block';
        mapOptions.innerHTML = '';

        // Helper function to format map names
        function formatMapName(mapFileName) {
            const parts = mapFileName.split('_');
            const mapName = parts[0] + (parts[1] === 'Map' ? ' Map' : ''); // e.g., "Angerer Map", "IrisLAB Map"
            const langCode = parts.find(p => p === 'DE' || p === 'EN' || p === 'FR');
            let language = '';
            switch (langCode) {
                case 'DE': language = 'German'; break;
                case 'EN': language = 'English'; break;
                case 'FR': language = 'French'; break;
                default: language = 'Unknown'; // Fallback
            }
            return `(${language}) ${mapName}`;
        }

        // Populate map options as a simple list
        availableMaps.forEach(map => {
            const option = document.createElement('div');
            option.className = 'map-option';
            const displayName = formatMapName(map); // Format the name
            option.innerHTML = `<span>${displayName}</span>`; // Use the formatted name
            option.dataset.mapFile = map; // Store original filename if needed later
            option.onclick = function() {
                currentMap = map; // Use the original filename when setting currentMap
                if (isDualViewActive) {
                    loadSVG(currentMap, 'L');
                    loadSVG(currentMap, 'R');
                } else {
                    loadSVG(currentMap, currentEye);
                }
                mapModal.style.display = 'none';
            };
            mapOptions.appendChild(option);
        });
    });

    // Custom map upload
    document.getElementById('customMap')?.addEventListener('click', () => {
        // Show alert message
        // alert('Please contact Irislab to enable the Custom Map feature.');

        // Open the Irislab contact page in a new tab
        // window.open('https://www.irislab.com/pages/contact-us-v1', '_blank');

        // --- Removed file input code ---
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.svg';
        input.onchange = e => {
            const file = e.target?.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = event => {
                if (!event.target?.result) return;
                const sanitizedSvg = DOMPurify.sanitize(event.target.result, { USE_PROFILES: { svg: true } });
                
                currentMap = 'custom';
                customSvgContent = sanitizedSvg;
                
                if (isDualViewActive) {
                    if (leftSvgContainer) {
                        leftSvgContainer.innerHTML = customSvgContent;
                        setupSvgElement(leftSvgContainer, 'L');
                        changeMapColor(svgSettings['L'].mapColor, 'L');
                    }
                    if (rightSvgContainer) {
                        rightSvgContainer.innerHTML = customSvgContent;
                        setupSvgElement(rightSvgContainer, 'R');
                        changeMapColor(svgSettings['R'].mapColor, 'R');
                    }
                } else if (svgContainer) {
                    svgContainer.innerHTML = customSvgContent;
                    setupSvgElement(svgContainer, currentEye);
                    changeMapColor(svgSettings[currentEye].mapColor, currentEye);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });

    // Modal controls
    closeBtn?.addEventListener('click', () => {
        if (mapModal) mapModal.style.display = 'none';
    });

    window.addEventListener('click', function(event) {
        if (event.target === mapModal) {
            mapModal.style.display = 'none';
        }
    });

    // Notes functionality
    document.getElementById('notes')?.addEventListener('click', () => {
        const notes = prompt('Enter notes:');
        if (notes) {
            console.log('Notes saved:', notes);
            alert('Notes saved successfully!');
        }
    });

    // SVG handling functions
    function loadSVG(svgFile, eye = currentEye) {
        const container = isDualViewActive ? 
            (eye === 'L' ? leftSvgContainer : rightSvgContainer) : svgContainer;
        
        if (!container) return;

        if (currentMap === 'custom') {
            container.innerHTML = customSvgContent;
            setupSvgElement(container, eye);
            svgSettings[eye].svgContent = customSvgContent;
            // Apply current color settings after loading
            changeMapColor(svgSettings[eye].mapColor, eye);
        } else {
            fetch(`grids/${currentMap}_${eye}.svg`)
                .then(response => response.text())
                .then(svgContent => {
                    if (!container) return;
                    const sanitizedSVG = DOMPurify.sanitize(svgContent, { 
                        USE_PROFILES: { svg: true, svgFilters: true } 
                    });
                    container.innerHTML = sanitizedSVG;
                    svgSettings[eye].svgContent = sanitizedSVG;
                    setupSvgElement(container, eye);
                    // Apply current color settings after loading
                    changeMapColor(svgSettings[eye].mapColor, eye);
                })
                .catch(error => {
                    console.error('Error loading SVG:', error);
                    if (container) container.innerHTML = '';
                    alert(`Failed to load SVG: ${currentMap}_${eye}.svg`);
                });
        }
    }

    function setupSvgElement(container, eye) {
        const svgElement = container?.querySelector('svg');
        if (!svgElement) return;

        svgElement.setAttribute('width', '100%');
        svgElement.setAttribute('height', '100%');
        svgElement.style.pointerEvents = 'none';
        svgElement.style.userSelect = 'none';
        
        if (container) {
            container.style.opacity = svgSettings[eye].opacity;
        }
        
        const svgTexts = svgElement.querySelectorAll('text');
        svgTexts.forEach(text => {
            text.style.userSelect = 'none';
        });
    }

    function changeMapColor(color, eye) {
        const container = isDualViewActive ? 
            (eye === 'L' ? leftSvgContainer : rightSvgContainer) : svgContainer;
        
        if (!container) return;
    
        // Get all SVG elements including nested ones
        const allElements = container.getElementsByTagName('*');
    
        // Specific handling for IrisLAB map elements
        for (let element of allElements) {
            const tag = element.tagName.toLowerCase();
            
            // Handle text elements
            if (tag === 'text' || tag === 'tspan') {
                element.setAttribute('fill', color);
                element.setAttribute('stroke', 'none'); // Prevent text outlines
                continue;
            }
    
            // Handle paths (anatomical sections and lines)
            if (tag === 'path' || tag === 'line' || tag === 'circle') {
                // Get the current stroke-width
                const strokeWidth = element.getAttribute('stroke-width');
                
                // Set stroke color
                element.setAttribute('stroke', color);
                
                // Ensure thin lines remain visible
                if (strokeWidth === null || strokeWidth === '') {
                    element.setAttribute('stroke-width', '0.5');
                }
    
                // Only set fill for closed paths that originally had fill
                const currentFill = element.getAttribute('fill');
                if (currentFill && currentFill !== 'none') {
                    element.setAttribute('fill', color);
                }
                continue;
            }
    
            // Handle groups
            if (tag === 'g') {
                // Check if group has direct style attributes
                if (element.hasAttribute('stroke')) {
                    element.setAttribute('stroke', color);
                }
                if (element.hasAttribute('fill')) {
                    element.setAttribute('fill', color);
                }
                continue;
            }
    
            // Handle other specific elements
            if (['polygon', 'polyline', 'rect', 'ellipse'].includes(tag)) {
                element.setAttribute('stroke', color);
                // Check if element should have fill
                const currentFill = element.getAttribute('fill');
                if (currentFill && currentFill !== 'none') {
                    element.setAttribute('fill', color);
                }
            }
        }
    
        // Handle any CSS styles
        const styleElement = container.querySelector('style');
        if (styleElement) {
            let cssText = styleElement.textContent;
            // Replace all color definitions with new color
            cssText = cssText.replace(/(?:rgb|rgba|#)[^;{}]*/g, color);
            styleElement.textContent = cssText;
        }
    
        // Store color in settings
        svgSettings[eye].mapColor = color;
    
        // Force repaint
        container.style.display = 'none';
        container.offsetHeight; // Trigger reflow
        container.style.display = '';
    }

// Auto Levels Functionality
document.getElementById('autoLevels')?.addEventListener('click', () => {
    try {
        console.log('Auto Levels clicked');
        const settings = isDualViewActive ? ['L', 'R'] : [currentEye];
        
        settings.forEach(eye => {
            const canvas = imageSettings[eye].canvas;
            const ctx = imageSettings[eye].context;
            
            if (!canvas || !ctx) {
                console.log('No canvas or context for eye:', eye);
                return;
            }

            const analysis = analyzeImageData(ctx, canvas.width, canvas.height);
            if (!analysis) {
                console.log('No analysis data available for eye:', eye);
                return;
            }

            const adjustments = imageSettings[eye].adjustments;

            // Calculate adjustments
            if (analysis.avgBrightness < 85) {
                adjustments.exposure = Math.min(((100 - analysis.avgBrightness) / 100) * 70, 70);
                adjustments.shadows = Math.min(((80 - analysis.avgBrightness) / 80) * 60, 60);
            } else if (analysis.avgBrightness > 170) {
                adjustments.exposure = -Math.min(((analysis.avgBrightness - 155) / 100) * 50, 50);
                adjustments.highlights = Math.min(((analysis.avgBrightness - 155) / 100) * 60, 60);
            } else {
                adjustments.exposure = ((128 - analysis.avgBrightness) / 128) * 50;
            }

            const currentRange = analysis.contrastRange.max - analysis.contrastRange.min;
            adjustments.contrast = currentRange < 100 ? 
                Math.min(((180 / currentRange) - 1) * 70, 70) :
                currentRange > 200 ?
                    -Math.min(((currentRange / 180) - 1) * 30, 30) :
                    ((180 / currentRange) - 1) * 40;

            // Update UI sliders
            Object.entries(adjustments).forEach(([adjustment, value]) => {
                const slider = adjustmentSliders[adjustment];
                if (!slider) return;
                
                const limitedValue = Math.max(-100, Math.min(100, value));
                slider.value = limitedValue;
                const valueDisplay = slider.parentElement?.querySelector('.adjustment-value');
                if (valueDisplay) {
                    valueDisplay.textContent = limitedValue.toFixed(1);
                }
                adjustments[adjustment] = limitedValue;
            });

            // Update canvas
            requestAnimationFrame(() => {
                updateCanvasImage(eye);
            });
        });

        // Update histogram after all adjustments
        setTimeout(updateHistogram, 100);
    } catch (error) {
        console.error('Error in autoLevels:', error);
    }
});

    // Utility functions
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Drag prevention
    document.addEventListener('dragover', function(e) {
        e.preventDefault();
    });

    document.addEventListener('drop', function(e) {
        e.preventDefault();
    });

    // Initialize the application
    function initialize() {
        if (histogramCanvas) {
            histogramCanvas.width = histogramCanvas.offsetWidth || 300;
            histogramCanvas.height = histogramCanvas.offsetHeight || 150;
        }

        loadSVG(currentMap, 'L');
        loadSVG(currentMap, 'R');
        setupAdjustmentSliders();

        class MobileUIManager {
            constructor() {
                this.menuState = {
                    isOpen: false,
                    activePanel: null
                };
                this.touchStartX = 0;
                this.touchStartY = 0;
                this.menuContainer = document.getElementById('menuContainer');
                this.initializeMobileMenu();
            }
        
            initializeMobileMenu() {
                // Create mobile menu toggle
                const menuToggle = document.createElement('button');
                menuToggle.className = 'mobile-menu-toggle';
                menuToggle.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24">
                        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
                    </svg>
                `;
                document.body.appendChild(menuToggle);
        
                // Create bottom navigation
                const bottomNav = document.createElement('div');
                bottomNav.className = 'bottom-navigation';
                bottomNav.innerHTML = `
                    <div class="nav-item" data-panel="transform">
                        <svg><!-- Transform icon --></svg>
                        <span>Transform</span>
                    </div>
                    <div class="nav-item" data-panel="adjustments">
                        <svg><!-- Adjustments icon --></svg>
                        <span>Adjust</span>
                    </div>
                    <div class="nav-item" data-panel="maps">
                        <svg><!-- Maps icon --></svg>
                        <span>Maps</span>
                    </div>
                `;
                document.body.appendChild(bottomNav);
        
                this.setupEventListeners();
            }
        
            setupEventListeners() {
                // Touch event handling
                document.addEventListener('touchstart', this.handleTouchStart.bind(this));
                document.addEventListener('touchmove', this.handleTouchMove.bind(this));
                document.addEventListener('touchend', this.handleTouchEnd.bind(this));
        
                // Panel navigation
                const navItems = document.querySelectorAll('.nav-item');
                navItems.forEach(item => {
                    item.addEventListener('click', () => this.togglePanel(item.dataset.panel));
                });
                
            }
        
            handleTouchStart(e) {
                this.touchStartX = e.touches[0].clientX;
                this.touchStartY = e.touches[0].clientY;
            }
        
            handleTouchMove(e) {
                if (!this.touchStartX || !this.touchStartY) return;
        
                const xDiff = this.touchStartX - e.touches[0].clientX;
                const yDiff = this.touchStartY - e.touches[0].clientY;
        
                // Implement swipe logic
                if (Math.abs(xDiff) > Math.abs(yDiff)) {
                    if (xDiff > 0) {
                        // Swipe left - close panel
                        this.closeActivePanel();
                    } else {
                        // Swipe right - open panel
                        this.openLastPanel();
                    }
                }
            }
        
            togglePanel(panelId) {
                const panel = document.querySelector(`.panel-${panelId}`);
                if (this.menuState.activePanel === panelId) {
                    this.closeActivePanel();
                } else {
                    this.openPanel(panelId);
                }
            }
        }
        
        // 2. TOUCH-OPTIMIZED CONTROLS
        // --------------------------
        class TouchControls {
            constructor() {
                this.initializeControls();
            }
        
            initializeControls() {
                // Transform existing sliders into touch-friendly versions
                const sliders = document.querySelectorAll('.adjustment-slider');
                sliders.forEach(slider => {
                    this.createTouchFriendlySlider(slider);
                });
        
                // Add gesture recognition for image manipulation
                this.setupImageGestures();
            }
        
            createTouchFriendlySlider(originalSlider) {
                const touchSlider = document.createElement('div');
                touchSlider.className = 'touch-slider';
                touchSlider.innerHTML = `
                    <div class="touch-slider-track">
                        <div class="touch-slider-fill"></div>
                        <div class="touch-slider-handle"></div>
                    </div>
                    <div class="touch-slider-labels">
                        <span class="min">${originalSlider.min}</span>
                        <span class="max">${originalSlider.max}</span>
                    </div>
                `;
        
                this.setupSliderEvents(touchSlider, originalSlider);
                originalSlider.parentNode.replaceChild(touchSlider, originalSlider);
            }
        
            setupImageGestures() {
                const imageContainer = document.getElementById('image-container');
                let initialDistance = 0;
                let initialScale = 1;
        
                // Pinch to zoom
                imageContainer.addEventListener('touchstart', (e) => {
                    if (e.touches.length === 2) {
                        initialDistance = Math.hypot(
                            e.touches[0].pageX - e.touches[1].pageX,
                            e.touches[0].pageY - e.touches[1].pageY
                        );
                        initialScale = imageSettings[currentEye].scale;
                    }
                });
        
                imageContainer.addEventListener('touchmove', (e) => {
                    if (e.touches.length === 2) {
                        const currentDistance = Math.hypot(
                            e.touches[0].pageX - e.touches[1].pageX,
                            e.touches[0].pageY - e.touches[1].pageY
                        );
                        const scale = (currentDistance / initialDistance) * initialScale;
                        updateTransform('scale', scale);
                    }
                });
            }
        }
        
        // 3. RESPONSIVE PANELS SYSTEM
        // --------------------------
        class ResponsivePanels {
            constructor() {
                this.panels = {
                    transform: this.createTransformPanel(),
                    adjustments: this.createAdjustmentsPanel(),
                    maps: this.createMapsPanel()
                };
                this.initializePanels();
            }
        
            createTransformPanel() {
                const panel = document.createElement('div');
                panel.className = 'mobile-panel panel-transform';
                panel.innerHTML = `
                    <div class="panel-header">
                        <h3>Transform</h3>
                        <button class="panel-close">×</button>
                    </div>
                    <div class="panel-content">
                        <!-- Transform controls -->
                    </div>
                `;
                return panel;
            }
        
            initializePanels() {
                Object.values(this.panels).forEach(panel => {
                    document.body.appendChild(panel);
                    this.setupPanelInteractions(panel);
                });
            }
        
            setupPanelInteractions(panel) {
                const header = panel.querySelector('.panel-header');
                let startY = 0;
                let currentY = 0;
        
                header.addEventListener('touchstart', (e) => {
                    startY = e.touches[0].clientY;
                    currentY = panel.getBoundingClientRect().top;
                });
        
                header.addEventListener('touchmove', (e) => {
                    const deltaY = e.touches[0].clientY - startY;
                    panel.style.transform = `translateY(${deltaY}px)`;
                });
        
                header.addEventListener('touchend', () => {
                    const finalPosition = panel.getBoundingClientRect().top;
                    if (finalPosition > window.innerHeight * 0.7) {
                        this.closePanel(panel);
                    } else {
                        this.snapPanelToPosition(panel);
                    }
                });
            }
        }
        
        // 4. Initialize Mobile Optimizations
        // --------------------------------
        document.addEventListener('DOMContentLoaded', function() {
            if (window.matchMedia('(max-width: 768px)').matches) {
                const mobileUI = new MobileUIManager();
                const touchControls = new TouchControls();
                const responsivePanels = new ResponsivePanels();
            }
        });

        const resizeHandler = debounce(() => {
            if (histogramCanvas) {
                histogramCanvas.width = histogramCanvas.offsetWidth;
                histogramCanvas.height = histogramCanvas.offsetHeight;
                updateHistogram();
            }
        }, 250);

        window.addEventListener('resize', resizeHandler);

        if (opacitySlider) {
            opacitySlider.value = svgSettings[currentEye].opacity;
        }
        if (mapColor) {
            mapColor.value = svgSettings[currentEye].mapColor;
        }

        // Initialize gallery
        galleryAccordion.style.display = 'block';
        
    }

    // Start the application
    initialize();

    // Event Listeners for Image Upload
    imageUpload.addEventListener('change', function(e) {
        const files = e.target.files;
        if (!files.length) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const reader = new FileReader();
            
            reader.onload = function(event) {
                const img = new Image();
                img.onload = function() {
                    if (isDualViewActive) {
                        imageSettings['L'].image = img;
                        imageSettings['R'].image = img;
                        // === ADDED: Clear warp for new image ===
                        localStorage.removeItem('warpPoints_L');
                        meshPoints['L'] = null;
                        localStorage.removeItem('warpPoints_R');
                        meshPoints['R'] = null;
                        // === END ADDED ===
                        // Clear undo/redo stacks for warp
                        undoStack = [];
                        redoStack = [];
                        updateWarpActionButtons();

                        createCanvasForEye('L');
                        createCanvasForEye('R');
                        loadImageForSpecificEye('L');
                        loadImageForSpecificEye('R');
                    } else {
                        imageSettings[currentEye].image = img;
                        // === ADDED: Clear warp for new image ===
                        localStorage.removeItem(`warpPoints_${currentEye}`);
                        meshPoints[currentEye] = null;
                        // === END ADDED ===
                        // Clear undo/redo stacks for warp
                        undoStack = [];
                        redoStack = [];
                        updateWarpActionButtons();

                        createCanvasForEye(currentEye);
                        loadImageForSpecificEye(currentEye);
                    }
                    resetAdjustments(); // This already calls autoFit and updates canvas
                    addToGallery(event.target.result, file.name);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });   


    // Image transformation controls
    document.getElementById('rotateLeft')?.addEventListener('click', () => {
        if (isDualViewActive) {
            ['L', 'R'].forEach(eye => {
                imageSettings[eye].rotation -= rotationStep;
                updateCanvasTransform(eye);
            });
        } else {
            imageSettings[currentEye].rotation -= rotationStep;
            updateCanvasTransform(currentEye);
        }
    });

    document.getElementById('rotateRight')?.addEventListener('click', () => {
        if (isDualViewActive) {
            ['L', 'R'].forEach(eye => {
                imageSettings[eye].rotation += rotationStep;
                updateCanvasTransform(eye);
            });
        } else {
            imageSettings[currentEye].rotation += rotationStep;
            updateCanvasTransform(currentEye);
        }
    });

    document.getElementById('zoomIn')?.addEventListener('click', () => {
        const zoomMultiplier = 1.02;
        const eyesToUpdate = isDualViewActive ? ['L', 'R'] : [currentEye];
        eyesToUpdate.forEach(eye => {
            const settings = imageSettings[eye];
            if (!settings) return;

            if (isImagePositionLocked) {
                settings.scaleX = Math.min(settings.scaleX * zoomMultiplier, 10);
                settings.scaleY = Math.min(settings.scaleY * zoomMultiplier, 10);
        } else {
                settings.scale = Math.min(settings.scale * zoomMultiplier, 10);
                settings.scaleX = settings.scale;
                settings.scaleY = settings.scale;
            }
            updateCanvasTransform(eye);
        });
    });

    document.getElementById('zoomOut')?.addEventListener('click', () => {
        const zoomMultiplier = 1 / 1.02;
        const eyesToUpdate = isDualViewActive ? ['L', 'R'] : [currentEye];
        eyesToUpdate.forEach(eye => {
            const settings = imageSettings[eye];
            if (!settings) return;

            if (isImagePositionLocked) {
                settings.scaleX = Math.max(settings.scaleX * zoomMultiplier, 0.1);
                settings.scaleY = Math.max(settings.scaleY * zoomMultiplier, 0.1);
        } else {
                settings.scale = Math.max(settings.scale * zoomMultiplier, 0.1);
                settings.scaleX = settings.scale;
                settings.scaleY = settings.scale;
            }
            updateCanvasTransform(eye);
        });
    });

    // Movement controls
    // Define movement function
    function moveImage(direction) {
        if (isImagePositionLocked) return; // Prevent movement if locked
        const amount = 10;
        if (isDualViewActive) {
            ['L', 'R'].forEach(eye => {
                const settings = imageSettings[eye];
                if (!settings) return;
                switch(direction) {
                    case 'up':
                        settings.translateY -= amount;
                        break;
                    case 'down':
                        settings.translateY += amount;
                        break;
                    case 'left':
                        settings.translateX -= amount;
                        break;
                    case 'right':
                        settings.translateX += amount;
                        break;
                }
                updateCanvasTransform(eye);
            });
        } else {
            const settings = imageSettings[currentEye];
            if (!settings) return;
            switch(direction) {
                case 'up':
                    settings.translateY -= amount;
                    break;
                case 'down':
                    settings.translateY += amount;
                    break;
                case 'left':
                    settings.translateX -= amount;
                    break;
                case 'right':
                    settings.translateX += amount;
                    break;
            }
            updateCanvasTransform(currentEye);
        }
    }

    // Setup movement controls in initialize function
    function initialize() {
        if (histogramCanvas) {
            histogramCanvas.width = histogramCanvas.offsetWidth || 300;
            histogramCanvas.height = histogramCanvas.offsetHeight || 150;
        }

        // Add this new section to your existing initialize function
        const moveUp = document.getElementById('moveUp');
        const moveDown = document.getElementById('moveDown');
        const moveLeft = document.getElementById('moveLeft');
        const moveRight = document.getElementById('moveRight');

        if (moveUp) moveUp.onclick = () => moveImage('up');
        if (moveDown) moveDown.onclick = () => moveImage('down');
        if (moveLeft) moveLeft.onclick = () => moveImage('left');
        if (moveRight) moveRight.onclick = () => moveImage('right');

        // Rest of your existing initialize code
        loadSVG(currentMap, 'L');
        loadSVG(currentMap, 'R');
        setupAdjustmentSliders();

        controls.forEach(control => {
            makeElementDraggable(control);
        });
            // Add transformation controls
    const zoomIn = document.getElementById('zoomIn');
    const zoomOut = document.getElementById('zoomOut');
    const rotateLeft = document.getElementById('rotateLeft');
    const rotateRight = document.getElementById('rotateRight');

    // Zoom In
    if(zoomIn) {
        zoomIn.onclick = () => {
            console.log('Zoom in clicked'); // Debug log
            if (isDualViewActive) {
                ['L', 'R'].forEach(eye => {
                    let newScale = (imageSettings[eye].scale || 1) * 1.02;
                    newScale = Math.min(newScale, 10);
                    imageSettings[eye].scale = newScale;
                    updateCanvasTransform(eye);
                });
            } else {
                let newScale = (imageSettings[currentEye].scale || 1) * 1.02;
                newScale = Math.min(newScale, 10);
                imageSettings[currentEye].scale = newScale;
                updateCanvasTransform(currentEye);
            }
        };
    }

    // Zoom Out
    if(zoomOut) {
        zoomOut.onclick = () => {
            console.log('Zoom out clicked'); // Debug log
            if (isDualViewActive) {
                ['L', 'R'].forEach(eye => {
                    let newScale = (imageSettings[eye].scale || 1) / 1.02;
                    newScale = Math.max(newScale, 0.1);
                    imageSettings[eye].scale = newScale;
                    updateCanvasTransform(eye);
                });
            } else {
                let newScale = (imageSettings[currentEye].scale || 1) / 1.02;
                newScale = Math.max(newScale, 0.1);
                imageSettings[currentEye].scale = newScale;
                updateCanvasTransform(currentEye);
            }
        };
    }

    // Rotate Left
    if(rotateLeft) {
        rotateLeft.onclick = () => {
            console.log('Rotate left clicked'); // Debug log
            if (isDualViewActive) {
                ['L', 'R'].forEach(eye => {
                    imageSettings[eye].rotation -= rotationStep;
                    updateCanvasTransform(eye);
                });
            } else {
                imageSettings[currentEye].rotation -= rotationStep;
                updateCanvasTransform(currentEye);
            };
        };
    }

    // Rotate Right
    if(rotateRight) {
        rotateRight.onclick = () => {
            console.log('Rotate right clicked'); // Debug log
            if (isDualViewActive) {
                ['L', 'R'].forEach(eye => {
                    imageSettings[eye].rotation += rotationStep;
                    updateCanvasTransform(eye);
                });
            } else {
                imageSettings[currentEye].rotation += rotationStep;
                updateCanvasTransform(currentEye);
            };
        };
    }
    }
    

    // Gallery Functions
    function addToGallery(imageDataUrl, name) {
        const galleryItem = document.createElement('div');
        galleryItem.className = 'gallery-item';
        galleryItem.innerHTML = `
            <div class="gallery-item-header">
                <span class="image-name">${name}</span>
                <div class="gallery-item-controls">
                    <button class="btn rename-btn">Rename</button>
                    <button class="btn load-btn">Load</button>
                </div>
            </div>
            <div class="gallery-item-content">
                <img src="${imageDataUrl}" alt="${name}" loading="lazy">
            </div>
        `;

        setupGalleryItemEvents(galleryItem, imageDataUrl);
        galleryAccordion.appendChild(galleryItem);
    }

    function setupGalleryItemEvents(galleryItem, imageDataUrl) {
        const imageNameElement = galleryItem.querySelector('.image-name');
        const renameBtn = galleryItem.querySelector('.rename-btn');
        const loadBtn = galleryItem.querySelector('.load-btn');
        
        renameBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const currentName = imageNameElement.textContent;
            const newName = prompt('Enter new name:', currentName);
            if (newName?.trim()) {
                imageNameElement.textContent = newName.trim();
            }
        });

        loadBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            loadImageFromGallery(imageDataUrl);
        });

        // Toggle gallery item content
        galleryItem.querySelector('.gallery-item-header').addEventListener('click', function() {
            const content = galleryItem.querySelector('.gallery-item-content');
            content.classList.toggle('active');
        });
    }

    function loadImageFromGallery(imageDataUrl) {
        const img = new Image();
        img.onload = function() {
            if (isDualViewActive) {
                imageSettings['L'].image = img;
                imageSettings['R'].image = img;
                createCanvasForEye('L');
                createCanvasForEye('R');
                loadImageForSpecificEye('L');
                loadImageForSpecificEye('R');
            } else {
                imageSettings[currentEye].image = img;
                createCanvasForEye(currentEye);
                loadImageForSpecificEye(currentEye);
            }
            resetAdjustments();
        };
        img.src = imageDataUrl;
    }

    // Event listener for the new stretch lock button
    const toggleStretchLockBtn = document.getElementById('toggleStretchLockBtn');
    let isImagePositionLocked = false;
    const warpModeBtn = document.getElementById('warpModeBtn');
    let warpModeActive = false;

    if (toggleStretchLockBtn) {
        toggleStretchLockBtn.addEventListener('click', () => {
            isImagePositionLocked = !isImagePositionLocked;

            const eyesToUpdate = isDualViewActive ? ['L', 'R'] : [currentEye];

            eyesToUpdate.forEach(eye => {
                const settings = imageSettings[eye];
                if (!settings) return;

                if (isImagePositionLocked) {
                    toggleStretchLockBtn.textContent = '🔒';
                    console.log(`Image position LOCKED for eye: ${eye}. Stretch mode ENABLED.`);
                    // Show Warp button container when locked
                    if (warpControlsContainer) warpControlsContainer.style.display = 'flex';
                    updateWarpActionButtons(); // Update button states when shown
                } else {
                    toggleStretchLockBtn.textContent = '🔓';
                    console.log(`Image position UNLOCKED for eye: ${eye}. Stretch mode DISABLED.`);
                    // Hide Warp button container when unlocked
                    if (warpControlsContainer) warpControlsContainer.style.display = 'none'; // Hide the new container
                    // Exit warp mode if active
                    warpModeActive = false;
                     // Also hide grid if it was active
                    if (settings.canvas) updateCanvasImage(eye); 
                }
            });
            // Refresh canvas state after lock toggle
            const activeEyes = isDualViewActive ? ['L', 'R'] : [currentEye];
            activeEyes.forEach(eye => updateCanvasImage(eye));
        });
    }

    if (warpModeBtn) {
        warpModeBtn.addEventListener('click', () => {
            warpModeActive = !warpModeActive;
            console.log('Warp mode toggled:', warpModeActive);
             // Refresh canvas state after warp toggle
            const activeEyes = isDualViewActive ? ['L', 'R'] : [currentEye];
            activeEyes.forEach(eye => updateCanvasImage(eye));
        });
    }

    const HANDLE_SIZE = 8; // pixels
    const HANDLE_COLOR = 'rgba(255, 255, 255, 0.8)';
    const HANDLE_STROKE_COLOR = 'rgba(0, 0, 0, 0.8)';

    function drawResizeHandles(eye) {
        const settings = imageSettings[eye];
        if (!settings || !settings.canvas || !settings.image || !isImagePositionLocked) {
            return;
        }

        const ctx = settings.context;
        const img = settings.image;

        const imgBaseWidth = img.naturalWidth;
        const imgBaseHeight = img.naturalHeight;

        const avgScale = (settings.scaleX + settings.scaleY) / 2;
        // Prevent division by zero or extremely small scales causing huge handles
        const safeAvgScale = Math.max(0.1, avgScale); 
        const effectiveHandleSize = HANDLE_SIZE / safeAvgScale;
        const effectiveLineWidth = 1 / safeAvgScale;

        const handles = {
            tl: { x: 0, y: 0 },
            tm: { x: imgBaseWidth / 2, y: 0 },
            tr: { x: imgBaseWidth, y: 0 },
            lm: { x: 0, y: imgBaseHeight / 2 },
            rm: { x: imgBaseWidth, y: imgBaseHeight / 2 },
            bl: { x: 0, y: imgBaseHeight },
            bm: { x: imgBaseWidth / 2, y: imgBaseHeight },
            br: { x: imgBaseWidth, y: imgBaseHeight }
        };

        ctx.save();
        ctx.fillStyle = HANDLE_COLOR;
        ctx.strokeStyle = HANDLE_STROKE_COLOR;
        ctx.lineWidth = Math.max(0.5, effectiveLineWidth); 

        for (const key in handles) {
            const pos = handles[key];
            ctx.fillRect(
                pos.x - effectiveHandleSize / 2,
                pos.y - effectiveHandleSize / 2,
                effectiveHandleSize,
                effectiveHandleSize
            );
            ctx.strokeRect(
                pos.x - effectiveHandleSize / 2,
                pos.y - effectiveHandleSize / 2,
                effectiveHandleSize,
                effectiveHandleSize
            );
        }
        ctx.restore();
    }

    // Mesh points for warp grid (per eye)
    const meshGridRows = 4;
    const meshGridCols = 4;
    const meshPointRadius = 12; // Increased from 8 for easier hit test
    let meshPoints = { L: null, R: null };
    let draggingMeshPoint = null; // {row, col}
    let dragOffset = { x: 0, y: 0 };

    function initMeshPoints(eye) {
        const settings = imageSettings[eye];
        if (!settings || !settings.image) return;

        // Try to load saved points from Local Storage
        const storageKey = `warpPoints_${eye}`;
        const savedPointsJson = localStorage.getItem(storageKey);

        if (savedPointsJson) {
            try {
                const loadedPoints = JSON.parse(savedPointsJson);
                // Basic validation: check if it's an array of arrays with the expected dimensions
                if (Array.isArray(loadedPoints) && loadedPoints.length === (meshGridRows + 1) &&
                    Array.isArray(loadedPoints[0]) && loadedPoints[0].length === (meshGridCols + 1) &&
                    typeof loadedPoints[0][0].x === 'number' && typeof loadedPoints[0][0].y === 'number') 
                {
                    meshPoints[eye] = loadedPoints;
                    console.log(`Loaded saved warp points for eye ${eye}`);
                    return; // Points loaded, no need to initialize default
                } else {
                    console.warn(`Invalid warp points data found in localStorage for eye ${eye}. Ignoring.`);
                    localStorage.removeItem(storageKey); // Remove invalid data
                }
            } catch (e) {
                console.error(`Error parsing saved warp points for eye ${eye}:`, e);
                localStorage.removeItem(storageKey); // Remove corrupted data
            }
        }

        // If no valid saved points, initialize default grid
        console.log(`Initializing default warp points for eye ${eye}`);
        const width = settings.image.naturalWidth;
        const height = settings.image.naturalHeight;
        const points = [];
        for (let r = 0; r <= meshGridRows; r++) { 
            points[r] = [];
            for (let c = 0; c <= meshGridCols; c++) {
                points[r][c] = {
                    x: (width / meshGridCols) * c,
                    y: (height / meshGridRows) * r
                };
            }
        }
        meshPoints[eye] = points;
    }

    function drawWarpGrid(eye) {
        const settings = imageSettings[eye];
        if (!settings || !settings.canvas || !settings.image) return;
        if (!isImagePositionLocked || !warpModeActive) return;
        // Initialize mesh points if needed
        if (!meshPoints[eye]) initMeshPoints(eye);
        const points = meshPoints[eye];
        const ctx = settings.context;
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.7)';
        ctx.lineWidth = 1;
        // Draw grid lines
        for (let r = 0; r <= meshGridRows; r++) {
            ctx.beginPath();
            for (let c = 0; c <= meshGridCols; c++) {
                const pt = points[r][c];
                if (c === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
        }
        for (let c = 0; c <= meshGridCols; c++) {
            ctx.beginPath();
            for (let r = 0; r <= meshGridRows; r++) {
                const pt = points[r][c];
                if (r === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
        }
        // Draw control points
        ctx.fillStyle = 'rgba(0, 200, 255, 0.9)';
        for (let r = 0; r <= meshGridRows; r++) {
            for (let c = 0; c <= meshGridCols; c++) {
                const pt = points[r][c];
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 5, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    // Add mesh point dragging to canvas interaction (single view only)
    function setupMeshPointDragging(canvas, eye) {
        canvas.addEventListener('pointerdown', function(e) {
            if (!warpModeActive || !isImagePositionLocked) return;
            const settings = imageSettings[eye];
            if (!settings || !settings.image) return;
            if (!meshPoints[eye]) initMeshPoints(eye);
            const rect = canvas.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
            const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
            
            // Hit test mesh points using meshGridRows/Cols and meshPointRadius declared earlier
            for (let r = 0; r <= meshGridRows; r++) {
                for (let c = 0; c <= meshGridCols; c++) {
                    const pt = meshPoints[eye][r][c];
                    const dx = mouseX - pt.x;
                    const dy = mouseY - pt.y;
                    const distSq = dx * dx + dy * dy;
                    const radiusSq = meshPointRadius * meshPointRadius; 

                    if (distSq <= radiusSq) {
                        // Save current state for Undo
                        if (meshPoints[eye]) {
                            undoStack.push(JSON.parse(JSON.stringify(meshPoints[eye])));
                            redoStack = []; // Clear redo stack on new action
                            updateWarpActionButtons();
                        }

                        draggingMeshPoint = { row: r, col: c }; // Assigns to draggingMeshPoint declared earlier
                        dragOffset.x = dx; // Assigns to dragOffset declared earlier
                        dragOffset.y = dy;
                        canvas.setPointerCapture(e.pointerId);
                        e.preventDefault();
                        e.stopPropagation(); 
                        return;
                    }
                }
            }
        });
        canvas.addEventListener('pointermove', function(e) {
            if (!warpModeActive || !isImagePositionLocked) return;
            if (!draggingMeshPoint) return;
            const settings = imageSettings[eye];
            const rect = canvas.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
            const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
            const { row, col } = draggingMeshPoint;
            meshPoints[eye][row][col].x = mouseX - dragOffset.x; // Updates meshPoints declared earlier
            meshPoints[eye][row][col].y = mouseY - dragOffset.y;
            updateCanvasImage(eye);
        });
        canvas.addEventListener('pointerup', function(e) {
            if (!warpModeActive || !isImagePositionLocked) return;
            if (draggingMeshPoint) {
                const eye = currentEye; // Assuming warp only works in single view for now
                const storageKey = `warpPoints_${eye}`;
                try {
                    // Save the current state of mesh points for this eye
                    localStorage.setItem(storageKey, JSON.stringify(meshPoints[eye]));
                    console.log(`Saved warp points for eye ${eye}`);
                } catch (error) {
                    console.error(`Error saving warp points for eye ${eye}:`, error);
                    // Potentially handle quota exceeded error
                }

                draggingMeshPoint = null; 
                canvas.releasePointerCapture(e.pointerId);
            }
        });
    }

    // Helper function to update Undo/Redo button states
    function updateWarpActionButtons() {
        if (undoWarpBtn) {
            undoWarpBtn.disabled = undoStack.length === 0;
        }
        if (redoWarpBtn) {
            redoWarpBtn.disabled = redoStack.length === 0;
        }
    }

    // Patch createCanvasForEye to set up mesh point dragging for current eye
    const originalCreateCanvasForEye = createCanvasForEye;
    createCanvasForEye = function(eye) {
        originalCreateCanvasForEye(eye);
        const settings = imageSettings[eye];
        if (settings && settings.canvas) {
            setupMeshPointDragging(settings.canvas, eye);
        }
    };

    // Add listener for the Undo button
    if (undoWarpBtn) {
        undoWarpBtn.addEventListener('click', () => {
            if (undoStack.length === 0) return; // Nothing to undo

            // Save current state to redo stack before undoing
            if (meshPoints[currentEye]) {
                redoStack.push(JSON.parse(JSON.stringify(meshPoints[currentEye])));
            }

            // Pop the previous state from the undo stack
            const previousMeshState = undoStack.pop();

            // Apply the previous state
            meshPoints[currentEye] = previousMeshState;

            // Update canvas and save to local storage
            updateCanvasImage(currentEye);
            try {
                localStorage.setItem(`warpPoints_${currentEye}`, JSON.stringify(meshPoints[currentEye]));
            } catch (error) {
                console.error(`Error saving undone warp points for eye ${currentEye}:`, error);
            }

            // Update button states
            updateWarpActionButtons();
        });
    }

    // Add listener for the Redo button
    if (redoWarpBtn) {
        redoWarpBtn.addEventListener('click', () => {
            if (redoStack.length === 0) return; // Nothing to redo

            // Save current state to undo stack before redoing
            if (meshPoints[currentEye]) {
                undoStack.push(JSON.parse(JSON.stringify(meshPoints[currentEye])));
            }

            // Pop the next state from the redo stack
            const nextMeshState = redoStack.pop();

            // Apply the next state
            meshPoints[currentEye] = nextMeshState;

            // Update canvas and save to local storage
            updateCanvasImage(currentEye);
            try {
                localStorage.setItem(`warpPoints_${currentEye}`, JSON.stringify(meshPoints[currentEye]));
            } catch (error) {
                console.error(`Error saving redone warp points for eye ${currentEye}:`, error);
            }

            // Update button states
            updateWarpActionButtons();
        });
    }

    // Add listener for the Reset Warp button
    if (resetWarpBtn) {
        resetWarpBtn.addEventListener('click', () => {
            if (!meshPoints[currentEye] && undoStack.length === 0) {
                // If there are no mesh points and nothing to undo, nothing to reset from or to.
                return;
            }

            // Save current state to undo stack before resetting, if there are points
            if (meshPoints[currentEye]) {
                undoStack.push(JSON.parse(JSON.stringify(meshPoints[currentEye])));
            }
            redoStack = []; // Clear redo stack

            // Clear current warp points from Local Storage and memory
            localStorage.removeItem(`warpPoints_${currentEye}`);
            meshPoints[currentEye] = null;

            // Initialize to default mesh points (this also saves them to localStorage)
            initMeshPoints(currentEye);

            // Update canvas and button states
            updateCanvasImage(currentEye);
            updateWarpActionButtons();
        });
    }
});

function autoLevels() {
    const settings = isDualViewActive ? ['L', 'R'] : [currentEye];

    settings.forEach(eye => {
        const adjustments = imageSettings[eye].adjustments;
        const canvas = imageSettings[eye].canvas;
        const ctx = imageSettings[eye].context;

        if (!canvas || !ctx) return;

        // Get image data from the canvas
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Calculate luminance histogram
        const luminanceHistogram = new Uint32Array(256);
        for (let i = 0; i < data.length; i += 4) {
            const luminance = Math.round(0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
            luminanceHistogram[luminance]++;
        }

        // Find cumulative distribution function (CDF)
        const totalPixels = canvas.width * canvas.height;
        const cdf = new Uint32Array(256);
        cdf[0] = luminanceHistogram[0];
        for (let i = 1; i < 256; i++) {
            cdf[i] = cdf[i - 1] + luminanceHistogram[i];
        }

        // Calculate lower and upper bounds (e.g., 1% and 99% percentiles)
        const lowerBound = totalPixels * 0.01;
        const upperBound = totalPixels * 0.99;

        let cdfMin = 0;
        let cdfMax = 255;

        for (let i = 0; i < 256; i++) {
            if (cdf[i] > lowerBound) {
                cdfMin = i;
                break;
            }
        }

        for (let i = 255; i >= 0; i--) {
            if (cdf[i] < upperBound) {
                cdfMax = i;
                break;
            }
        }

        // Calculate exposure and contrast adjustments
        const brightnessRange = cdfMax - cdfMin;
        const desiredRange = 220; // Target brightness range
        const contrastAdjustment = ((desiredRange / brightnessRange) - 1) * 100;
        const exposureAdjustment = ((128 - (cdfMin + cdfMax) / 2) / 128) * 100;

        adjustments.contrast = Math.max(-100, Math.min(100, contrastAdjustment));
        adjustments.exposure = Math.max(-100, Math.min(100, exposureAdjustment));

        // Update UI sliders
        if (adjustmentSliders.exposure) {
            adjustmentSliders.exposure.value = adjustments.exposure;
            adjustmentSliders.exposure.parentElement.querySelector('.adjustment-value').textContent = adjustments.exposure.toFixed(0);
        }

        if (adjustmentSliders.contrast) {
            adjustmentSliders.contrast.value = adjustments.contrast;
            adjustmentSliders.contrast.parentElement.querySelector('.adjustment-value').textContent = adjustments.contrast.toFixed(0);
        }

        // Apply adjustments
        updateCanvasImage(eye);
    });

    // Update histogram after auto levels
    setTimeout(updateHistogram, 100);
}



function applySharpness(ctx, amount) {
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const pixels = imageData.data;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    // Create temp array
    const temp = new Uint8ClampedArray(pixels.length);
    temp.set(pixels);

    // Normalized amount
    const strength = amount / 100;

    // Enhanced kernel for sharpening
    const kernel = [
        0, -1 * strength, 0,
        -1 * strength, 4 * strength + 1, -1 * strength,
        0, -1 * strength, 0
    ];

    // Apply convolution (optimized)
    convolve(temp, pixels, width, height, kernel);

    ctx.putImageData(imageData, 0, 0);
}

function convolve(src, dst, width, height, kernel) {
    const side = Math.round(Math.sqrt(kernel.length));
    const halfSide = Math.floor(side / 2);
    const alphaFac = 1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sy = y;
            let sx = x;
            let dstOff = (y * width + x) * 4;
            let r = 0, g = 0, b = 0, a = 0;

            for (let cy = 0; cy < side; cy++) {
                for (let cx = 0; cx < side; cx++) {
                    let scy = sy + cy - halfSide;
                    let scx = sx + cx - halfSide;
                    if (scy >= 0 && scy < height && scx >= 0 && scx < width) {
                        let srcOff = (scy * width + scx) * 4;
                        let wt = kernel[cy * side + cx];

                        r += src[srcOff] * wt;
                        g += src[srcOff + 1] * wt;
                        b += src[srcOff + 2] * wt;
                        a += src[srcOff + 3] * wt;
                    }
                }
            }
            dst[dstOff] = Math.min(Math.max(r, 0), 255);
            dst[dstOff + 1] = Math.min(Math.max(g, 0), 255);
            dst[dstOff + 2] = Math.min(Math.max(b, 0), 255);
            dst[dstOff + 3] = Math.min(Math.max(a, 0), 255);
        }
    }
}



