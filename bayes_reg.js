    // --- Global variables ---
    let data = { x: [], y: [] };
    let trueParams = {}; // Stores β0, β1, and known σ_noise
    let posteriorParams = {}; // Stores calculated posterior parameters

    // --- Helper functions ---
    function getVal(id) { return parseFloat(document.getElementById(id).value); }

    function setMsg(id, text, type = 'message') {
        const el = document.getElementById(id);
        if (el) {
            el.innerText = text;
            el.className = type; // Use 'message', 'warning', or 'error' class
        } else { console.error("Cannot find element with ID:", id); }
    }

    // --- Matrix/Vector Helpers ---
    // Invert a 2x2 matrix: [[a, b], [c, d]] -> 1/(ad-bc) * [[d, -b], [-c, a]]
    function invert2x2(M) {
        const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
        if (Math.abs(det) < 1e-15) { // Check for singularity
            console.error("Matrix is singular, cannot invert.", M);
            return null;
        }
        const invDet = 1.0 / det;
        return [
            [invDet * M[1][1], -invDet * M[0][1]],
            [-invDet * M[1][0], invDet * M[0][0]]
        ];
    }

    // Multiply a 2x2 matrix by a 2x1 vector: [[a, b], [c, d]] * [x, y]' -> [ax+by, cx+dy]'
    function multiply2x2Vector(M, v) {
        return [
            M[0][0] * v[0] + M[0][1] * v[1],
            M[1][0] * v[0] + M[1][1] * v[1]
        ];
    }

    // Multiply a 2xN matrix transpose by an Nx1 vector: M' * v
    function multiplyMatrixTransposeVector(Mt, v) { // Mt is N x 2
         if (!Mt || Mt.length === 0 || Mt[0].length !== 2 || Mt.length !== v.length) {
              console.error("Invalid dimensions for Mt' * v", Mt, v); return null;
         }
         const N = Mt.length;
         let res0 = 0;
         let res1 = 0;
         for(let i=0; i<N; i++) {
             res0 += Mt[i][0] * v[i];
             res1 += Mt[i][1] * v[i];
         }
         return [res0, res1];
    }

     // Multiply a 2xN matrix transpose by an Nx2 matrix: M' * M
     function multiplyMatrixTransposeMatrix(Mt, M) { // Mt is N x 2, M is N x 2
         if (!Mt || Mt.length === 0 || Mt[0].length !== 2 || Mt.length !== M.length || M[0].length !== 2) {
              console.error("Invalid dimensions for Mt' * M", Mt, M); return null;
         }
         const N = Mt.length;
         let res00 = 0, res01 = 0, res10 = 0, res11 = 0;
         for(let i=0; i<N; i++) {
              res00 += Mt[i][0] * M[i][0];
              res01 += Mt[i][0] * M[i][1];
              res10 += Mt[i][1] * M[i][0]; // Same as res01 if symmetric
              res11 += Mt[i][1] * M[i][1];
         }
         return [[res00, res01], [res10, res11]];
     }

    // --- Data Generation ---
    function calculate_implied_rho(beta1, sigma_x, sigma_noise) {
        if (sigma_x <= 0) return NaN;
        const signal_var = (beta1 * sigma_x) ** 2;
        const noise_var = sigma_noise ** 2;
        const total_var_y = signal_var + noise_var;
        if (total_var_y < 1e-9) return (beta1 === 0 ? 0 : Math.sign(beta1));
        const rho = Math.sign(beta1) * Math.sqrt(signal_var / total_var_y);
        return rho;
    }

    function generateAndPlotData() {
        setMsg('generation_message', '', 'message');
        document.getElementById('status').innerText = 'Generating data...';
        document.getElementById('summaryStats').innerText = ''; // Clear old results
        // Clear previous posterior plots
        plotPosteriorPDF(null, 'posteriorBeta0Plot', 'Posterior PDF for Intercept (β₀)');
        plotPosteriorPDF(null, 'posteriorBeta1Plot', 'Posterior PDF for Slope (β₁)');
        posteriorParams = {}; // Clear stored posterior params

        try {
            const beta0 = getVal('true_beta0');
            const beta1 = getVal('true_beta1');
            const mean_x = getVal('mean_x');
            const std_dev_x = getVal('std_dev_x');
            const sigma_noise = getVal('known_sigma_noise');
            const N = Math.max(2, Math.round(getVal('num_points')));
            document.getElementById('num_points').value = N;

            if (isNaN(beta0) || isNaN(beta1) || isNaN(mean_x) || isNaN(std_dev_x) || isNaN(sigma_noise) || isNaN(N)) {
                throw new Error("One or more input parameters are not valid numbers.");
            }
            if (std_dev_x <= 0) { throw new Error("Std Dev of X (σₓ) must be positive."); }
            if (sigma_noise < 0) { throw new Error("Known Error Std Dev (σ_noise) cannot be negative."); }


            trueParams = { beta0: beta0, beta1: beta1, sigma_noise: sigma_noise };

            const implied_rho = calculate_implied_rho(beta1, std_dev_x, sigma_noise);
            let message = `Implied population correlation ρ ≈ ${isNaN(implied_rho) ? 'N/A' : implied_rho.toFixed(3)}`;

            data.x = []; data.y = [];
            for (let i = 0; i < N; i++) {
                const xi = jStat.normal.sample(mean_x, std_dev_x);
                const noise = (sigma_noise === 0) ? 0 : jStat.normal.sample(0, sigma_noise);
                const yi = trueParams.beta0 + trueParams.beta1 * xi + noise;
                data.x.push(xi); data.y.push(yi);
            }

            if (N > 1 && jStat.variance(data.x) > 1e-9 && jStat.variance(data.y) > 1e-9) {
                const sample_corr = jStat.corrcoeff(data.x, data.y);
                message += `\nActual sample correlation ≈ ${sample_corr.toFixed(3)}`;
            } else {
                 message += `\nSample correlation undefined.`;
            }
            setMsg('generation_message', message, 'message');

            plotDataScatter();
            document.getElementById('status').innerText = 'Data generated. Ready to calculate posterior.';

        } catch (error) {
            console.error("Error during data generation:", error);
            setMsg('generation_message', "Error: " + error.message, 'error');
            document.getElementById('status').innerText = 'Data generation failed.';
            data = { x: [], y: [] }; trueParams = {}; plotDataScatter();
        }
    }

     // --- Plotting Functions ---
     function plotDataScatter(posteriorMeanBeta0, posteriorMeanBeta1) {
         const canvasId = 'dataScatterPlot'; const canvas = document.getElementById(canvasId); if (!canvas) { return; } const ctxScatter = canvas.getContext('2d'); if (!ctxScatter) { return; }
         const existingChart = Chart.getChart(canvasId); if (existingChart) { existingChart.destroy(); }

         const datasets = []; const scatterPoints = (data && data.x && data.y) ? data.x.map((val, index) => ({ x: val, y: data.y[index] })) : [];
         if (scatterPoints.length > 0) { datasets.push({ label: 'Simulated Data', data: scatterPoints, backgroundColor: 'rgba(0, 123, 255, 0.5)', type: 'scatter', order: 3 }); }

         let x_min_plot, x_max_plot;
         if (scatterPoints.length > 0) { x_min_plot = jStat.min(data.x); x_max_plot = jStat.max(data.x); const range = x_max_plot - x_min_plot; if (range > 1e-9) { x_min_plot -= range * 0.1; x_max_plot += range * 0.1; } else { x_min_plot -= 1; x_max_plot += 1; } } else { const mean_x = getVal('mean_x'); const std_dev_x = getVal('std_dev_x'); x_min_plot = (isNaN(mean_x) ? 0 : mean_x) - 3 * (isNaN(std_dev_x) || std_dev_x <= 0 ? 1 : std_dev_x); x_max_plot = (isNaN(mean_x) ? 0 : mean_x) + 3 * (isNaN(std_dev_x) || std_dev_x <= 0 ? 1 : std_dev_x); }
         const x_vals_line = [x_min_plot, x_max_plot];

         if (trueParams && typeof trueParams.beta0 === 'number' && typeof trueParams.beta1 === 'number') { const y_vals_true_line = x_vals_line.map(x_val => trueParams.beta0 + trueParams.beta1 * x_val); if(y_vals_true_line.every(isFinite)) { datasets.push({ label: 'True Regression Line', data: [{x: x_vals_line[0], y: y_vals_true_line[0]}, {x: x_vals_line[1], y: y_vals_true_line[1]}], borderColor: 'rgba(255, 0, 0, 0.7)', borderWidth: 2, fill: false, type: 'line', pointRadius: 0, order: 1 }); } }
         if (typeof posteriorMeanBeta0 === 'number' && typeof posteriorMeanBeta1 === 'number' && isFinite(posteriorMeanBeta0) && isFinite(posteriorMeanBeta1)) { const y_vals_posterior_line = x_vals_line.map(x_val => posteriorMeanBeta0 + posteriorMeanBeta1 * x_val); if(y_vals_posterior_line.every(isFinite)) { datasets.push({ label: 'Bayesian Regression Line (Posterior Mean)', data: [{x: x_vals_line[0], y: y_vals_posterior_line[0]}, {x: x_vals_line[1], y: y_vals_posterior_line[1]}], borderColor: 'rgba(0, 128, 0, 0.7)', borderWidth: 2, fill: false, type: 'line', pointRadius: 0, borderDash: [5, 5], order: 2 }); } }

         if (datasets.length === 0) { ctxScatter.clearRect(0, 0, canvas.width, canvas.height); ctxScatter.textAlign = 'center'; ctxScatter.fillStyle = '#888'; ctxScatter.fillText("Generate data to plot.", canvas.width / 2, 50); return; }
         try { new Chart(ctxScatter, { data: { datasets: datasets }, options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { x: { title: { display: true, text: 'X' }, type: 'linear', position: 'bottom' }, y: { title: { display: true, text: 'Y' } } }, plugins: { title: { display: true, text: 'Data Scatter Plot with Regression Lines' } } } }); } catch (chartError) { console.error(`Error creating scatter chart (${canvasId}):`, chartError); }
     }

    function plotPosteriorPDF(params, canvasId, title, trueValue) {
         // params = { mean, stdDev } for Normal distribution
         const canvas = document.getElementById(canvasId); if (!canvas) { return; } const ctx = canvas.getContext('2d'); if (!ctx) { return; }
         const chartInstance = Chart.getChart(canvasId); if (chartInstance) { chartInstance.destroy(); }

         if (!params || typeof params.mean !== 'number' || typeof params.stdDev !== 'number' || !isFinite(params.mean) || !isFinite(params.stdDev) || params.stdDev <= 0) {
             ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.textAlign = 'center'; ctx.fillStyle = '#888';
             ctx.fillText("Posterior not calculated or invalid.", canvas.width / 2, 50);
             return;
         }

         const { mean, stdDev } = params;
         const numPoints = 101;
         const plotMin = mean - 4 * stdDev;
         const plotMax = mean + 4 * stdDev;
         const step = (plotMax - plotMin) / (numPoints - 1);

         const pdfData = [];
         for (let i = 0; i < numPoints; i++) {
             const x = plotMin + i * step;
             const pdfValue = jStat.normal.pdf(x, mean, stdDev);
             if (isFinite(x) && isFinite(pdfValue)) {
                 pdfData.push({ x: x, y: pdfValue });
             }
         }

         if (pdfData.length === 0) {
             ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.textAlign = 'center'; ctx.fillStyle = '#888';
             ctx.fillText("Could not generate PDF data.", canvas.width / 2, 50);
             return;
         }

         const annotationOptions = {};
         if (typeof trueValue === 'number' && isFinite(trueValue)) {
            // This requires the chartjs-plugin-annotation. If not registered, it won't show.
            // For simplicity, we'll draw it manually.
         }

         try {
             new Chart(ctx, {
                 type: 'line',
                 data: {
                     datasets: [{ label: 'Posterior PDF', data: pdfData, borderColor: 'rgba(75, 192, 192, 1)', backgroundColor: 'rgba(75, 192, 192, 0.2)', borderWidth: 2, fill: true, pointRadius: 0, tension: 0.1 },
                        // Add a dataset for the vertical "true value" line
                        (typeof trueValue === 'number' && isFinite(trueValue)) ? {
                            label: 'True Value',
                            data: [{x: trueValue, y: 0}, {x: trueValue, y: jStat.normal.pdf(trueValue, mean, stdDev)}],
                            borderColor: 'rgb(255, 99, 132)',
                            borderWidth: 2,
                            fill: false,
                            pointRadius: 0,
                            type: 'line'
                        } : {}
                     ]
                 },
                 options: {
                     plugins: { title: { display: true, text: title }, legend: { display: true } },
                     scales: { y: { beginAtZero: true, title: { display: true, text: 'Density' } }, x: { type: 'linear', title: { display: true, text: 'Parameter Value' } } },
                     responsive: true, maintainAspectRatio: false, animation: false
                 }
             });
         } catch (chartError) { console.error(`Error creating PDF chart (${canvasId}):`, chartError); }
     }


    // --- Posterior Calculation (Known Variance) ---
    function calculateConjugatePosteriors() {
         if (!data || !data.x || data.x.length < 2) {
            alert("Please generate data (N>=2) first!");
            return;
         }
         document.getElementById('status').innerText = 'Calculating posterior...';
         document.getElementById('summaryStats').innerText = '';

         try {
             const N = data.x.length;
             const y = data.y;
             // Construct design matrix X (N x 2)
             const X = data.x.map(xi => [1, xi]);

             // Known error precision τ = 1/σ²
             const known_sigma = trueParams.sigma_noise;
             if (known_sigma <= 0) throw new Error("Known error standard deviation must be positive for posterior calculation.");
             const tau = 1 / (known_sigma * known_sigma);

             // Prior parameters
             const prior_mu = [getVal('prior_beta0_mean'), getVal('prior_beta1_mean')];
             const prior_std0 = getVal('prior_beta0_std');
             const prior_std1 = getVal('prior_beta1_std');

             if ([prior_mu[0], prior_mu[1], prior_std0, prior_std1].some(isNaN)) { throw new Error("One or more prior parameters are invalid."); }
             if (prior_std0 <= 0 || prior_std1 <= 0) { throw new Error("Prior std deviations must be positive."); }

             // Construct prior precision matrix Λ₀ = diag(1/var)
             const Lambda0 = [
                 [1 / (prior_std0 * prior_std0), 0],
                 [0, 1 / (prior_std1 * prior_std1)]
             ];

             // Intermediate terms
             const XtX = multiplyMatrixTransposeMatrix(X, X); // X'X (2x2)
             const Xty = multiplyMatrixTransposeVector(X, y); // X'y (2x1)
             if (!XtX || !Xty) throw new Error("Matrix calculation failed (XtX or Xty).");

             // Posterior precision Λn = Λ₀ + τ * XᵀX
             const Lambda_n = [
                 [Lambda0[0][0] + tau * XtX[0][0], Lambda0[0][1] + tau * XtX[0][1]],
                 [Lambda0[1][0] + tau * XtX[1][0], Lambda0[1][1] + tau * XtX[1][1]]
             ];

             // Posterior covariance Σn = Λn⁻¹
             const Sigma_n = invert2x2(Lambda_n);
             if (!Sigma_n) throw new Error("Posterior precision matrix Λn is singular.");

             // Posterior mean μn = Σn * (Λ₀μ₀ + τ * Xᵀy)
             const Lambda0_mu0 = multiply2x2Vector(Lambda0, prior_mu);
             const term_in_paren = [Lambda0_mu0[0] + tau * Xty[0], Lambda0_mu0[1] + tau * Xty[1]];
             const mu_n = multiply2x2Vector(Sigma_n, term_in_paren); // Posterior mean vector [μn0, μn1]

             // Extract marginal parameters for β₀ and β₁ (Normal distribution)
             const posterior_mean_beta0 = mu_n[0];
             const posterior_var_beta0 = Sigma_n[0][0];
             const posterior_std_beta0 = Math.sqrt(posterior_var_beta0);

             const posterior_mean_beta1 = mu_n[1];
             const posterior_var_beta1 = Sigma_n[1][1];
             const posterior_std_beta1 = Math.sqrt(posterior_var_beta1);

              // Store for plotting and summary
              posteriorParams = {
                 beta0: { mean: posterior_mean_beta0, stdDev: posterior_std_beta0 },
                 beta1: { mean: posterior_mean_beta1, stdDev: posterior_std_beta1 }
             };

             // Plotting
             plotPosteriorPDF(posteriorParams.beta0, 'posteriorBeta0Plot', `Posterior PDF for β₀ (Normal)`, trueParams.beta0);
             plotPosteriorPDF(posteriorParams.beta1, 'posteriorBeta1Plot', `Posterior PDF for β₁ (Normal)`, trueParams.beta1);
             plotDataScatter(posterior_mean_beta0, posterior_mean_beta1); // Update scatter with posterior mean line

             // Update Summary Stats
             const sample_corr = (N > 1 && jStat.variance(data.x) > 1e-9 && jStat.variance(data.y) > 1e-9) ? jStat.corrcoeff(data.x, data.y) : NaN;
             const implied_rho = calculate_implied_rho(trueParams.beta1, getVal('std_dev_x'), trueParams.sigma_noise);
             const summary = `Summary Statistics (Known Variance Posterior):
-------------------------------------------
Data Generation:
  N = ${N}
  True β₀ = ${trueParams.beta0.toFixed(3)}
  True β₁ = ${trueParams.beta1.toFixed(3)}
  Known σ_noise = ${trueParams.sigma_noise.toFixed(3)}
  Implied Population ρ ≈ ${isNaN(implied_rho) ? 'N/A' : implied_rho.toFixed(3)}
  Actual Sample Correlation ≈ ${isNaN(sample_corr) ? 'N/A' : sample_corr.toFixed(3)}

Posterior Parameters (β ~ Normal(μₙ, Σₙ)):
  Posterior Mean β₀ = ${posterior_mean_beta0.toFixed(3)}
  Posterior StdDev β₀ = ${posterior_std_beta0.toFixed(3)}
  Posterior Mean β₁ = ${posterior_mean_beta1.toFixed(3)}
  Posterior StdDev β₁ = ${posterior_std_beta1.toFixed(3)}
`;
             document.getElementById('summaryStats').innerText = summary;
             document.getElementById('status').innerText = 'Posterior calculated and plotted.';

         } catch(error) {
             console.error("Error during posterior calculation:", error);
             document.getElementById('status').innerText = 'Error: ' + error.message;
             plotPosteriorPDF(null, 'posteriorBeta0Plot', 'Posterior PDF for Intercept (β₀)');
             plotPosteriorPDF(null, 'posteriorBeta1Plot', 'Posterior PDF for Slope (β₁)');
             posteriorParams = {};
         }
    }

    // --- Initialization ---
    window.onload = () => {
         if (typeof Chart === 'undefined' || typeof jStat === 'undefined') {
             console.error("Chart.js or jStat library not loaded!");
             document.body.insertBefore(document.createTextNode("ERROR: Could not load required libraries."), document.body.firstChild);
             return;
         }
        generateAndPlotData(); // Generate initial data
        plotPosteriorPDF(null, 'posteriorBeta0Plot', 'Posterior PDF for Intercept (β₀)');
        plotPosteriorPDF(null, 'posteriorBeta1Plot', 'Posterior PDF for Slope (β₁)');
    };
