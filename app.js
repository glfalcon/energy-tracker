// Energy Tracker - Shared Application Logic
// This file contains all the business logic shared between desktop and mobile versions

let usageChart = null;

// Google Sheets configuration
const GOOGLE_CONFIG = {
    clientId: '531203228430-94fbaf0bc30tkp211gvac6ihbk4cc1do.apps.googleusercontent.com',
    apiKey: 'AIzaSyCzPYl9wWf3l4MTWpOpjCm7ZKu8h75Wmn4',
    discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
    scopes: 'https://www.googleapis.com/auth/spreadsheets',
    spreadsheetId: '1jVuwWya6E68qc3GnKiXRKnqwBD2wIpdVU-XE1KFPW-4'
};

let gapiInited = false;
let gisInited = false;
let tokenClient;
let accessToken = null;

// Weather configuration (Open-Meteo - no API key needed!)
const WEATHER_CONFIG = {
    latitude: 51.5074,  // London
    longitude: -0.1278,
    url: 'https://api.open-meteo.com/v1/forecast'
};

// Weather code to icon/description mapping
function getWeatherInfo(code) {
    const weatherCodes = {
        0: { icon: '☀️', desc: 'Clear' },
        1: { icon: '🌤️', desc: 'Mostly Clear' },
        2: { icon: '⛅', desc: 'Partly Cloudy' },
        3: { icon: '☁️', desc: 'Cloudy' },
        45: { icon: '🌫️', desc: 'Foggy' },
        48: { icon: '🌫️', desc: 'Icy Fog' },
        51: { icon: '🌧️', desc: 'Light Drizzle' },
        53: { icon: '🌧️', desc: 'Drizzle' },
        55: { icon: '🌧️', desc: 'Heavy Drizzle' },
        61: { icon: '🌧️', desc: 'Light Rain' },
        63: { icon: '🌧️', desc: 'Rain' },
        65: { icon: '🌧️', desc: 'Heavy Rain' },
        71: { icon: '🌨️', desc: 'Light Snow' },
        73: { icon: '🌨️', desc: 'Snow' },
        75: { icon: '🌨️', desc: 'Heavy Snow' },
        77: { icon: '🌨️', desc: 'Snow Grains' },
        80: { icon: '🌦️', desc: 'Light Showers' },
        81: { icon: '🌦️', desc: 'Showers' },
        82: { icon: '🌦️', desc: 'Heavy Showers' },
        85: { icon: '🌨️', desc: 'Snow Showers' },
        86: { icon: '🌨️', desc: 'Heavy Snow Showers' },
        95: { icon: '⛈️', desc: 'Thunderstorm' },
        96: { icon: '⛈️', desc: 'Thunderstorm + Hail' },
        99: { icon: '⛈️', desc: 'Thunderstorm + Heavy Hail' }
    };
    return weatherCodes[code] || { icon: '🌡️', desc: 'Unknown' };
}

// Fetch current weather from Open-Meteo
async function fetchWeather() {
    const weatherDisplay = document.getElementById('weatherDisplay');
    if (!weatherDisplay) return;

    try {
        const params = new URLSearchParams({
            latitude: WEATHER_CONFIG.latitude,
            longitude: WEATHER_CONFIG.longitude,
            current: 'temperature_2m,weather_code',
            daily: 'temperature_2m_max,temperature_2m_min',
            timezone: 'Europe/London',
            forecast_days: 1
        });

        const response = await fetch(`${WEATHER_CONFIG.url}?${params}`);

        if (!response.ok) {
            throw new Error('Weather API error');
        }

        const data = await response.json();
        const currentTemp = Math.round(data.current.temperature_2m);
        const highTemp = Math.round(data.daily.temperature_2m_max[0]);
        const lowTemp = Math.round(data.daily.temperature_2m_min[0]);
        const weatherCode = data.current.weather_code;
        const weather = getWeatherInfo(weatherCode);

        weatherDisplay.innerHTML = `
            <div class="weather-current">
                <span class="weather-icon">${weather.icon}</span>
                <span>${currentTemp}°C</span>
            </div>
            <span class="weather-hilo">↑${highTemp}° ↓${lowTemp}°</span>
        `;
        weatherDisplay.title = weather.desc;

    } catch (error) {
        console.error('Weather fetch error:', error);
        weatherDisplay.innerHTML = '<span class="weather-loading">--</span>';
    }
}

// Initialize Google API
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: GOOGLE_CONFIG.apiKey,
        discoveryDocs: GOOGLE_CONFIG.discoveryDocs,
    });
    gapiInited = true;
    maybeEnableButtons();
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CONFIG.clientId,
        scope: GOOGLE_CONFIG.scopes,
        callback: '',
    });
    gisInited = true;
    maybeEnableButtons();
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        const savedToken = localStorage.getItem('energyTrackerAccessToken');

        if (savedToken) {
            try {
                accessToken = JSON.parse(savedToken);
                gapi.client.setToken(accessToken);
            } catch(e) {
                accessToken = null;
            }
        }

        loadDataFromSource();
        updateGoogleStatus();
    }
}

// Authorize with Google
function authorizeGoogle() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        accessToken = gapi.client.getToken();
        localStorage.setItem('energyTrackerAccessToken', JSON.stringify(accessToken));
        await syncFromSheets();
        updateGoogleStatus();
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

// Sync data TO Google Sheets
async function syncToSheets(data) {
    if (!GOOGLE_CONFIG.spreadsheetId || !accessToken) {
        return false;
    }

    try {
        const rows = data.map(item => [
            item.date,
            item.meterReading,
            item.dailyUsage || '',
            item.entryTime || ''
        ]);

        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: GOOGLE_CONFIG.spreadsheetId,
            range: 'Daily Readings!A2:D'
        });

        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: GOOGLE_CONFIG.spreadsheetId,
            range: 'Daily Readings!A2',
            valueInputOption: 'RAW',
            resource: {
                values: rows
            }
        });

        return true;
    } catch (err) {
        console.error('Error syncing to sheets:', err);
        return false;
    }
}

// Sync data FROM Google Sheets
async function syncFromSheets() {
    if (!GOOGLE_CONFIG.spreadsheetId || !accessToken) {
        return false;
    }

    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_CONFIG.spreadsheetId,
            range: 'Daily Readings!A2:D',
        });

        const rows = response.result.values;
        if (!rows || rows.length === 0) {
            localStorage.setItem('lastSyncTime', new Date().toISOString());
            return false;
        }

        const data = rows.map(row => ({
            date: row[0],
            meterReading: parseFloat(row[1]),
            dailyUsage: row[2] ? parseFloat(row[2]) : null,
            entryTime: row[3] || null
        }));

        // Sort by date descending (newest first)
        data.sort((a, b) => new Date(b.date) - new Date(a.date));

        localStorage.setItem('energyData', JSON.stringify(data));
        localStorage.setItem('lastSyncTime', new Date().toISOString());
        displayHistory();

        return true;
    } catch (err) {
        console.error('Error syncing from sheets:', err);
        if (err.status === 401 || err.status === 403) {
            accessToken = null;
            localStorage.removeItem('energyTrackerAccessToken');
            updateGoogleStatus();
        }
        return false;
    }
}

// Load data from appropriate source
async function loadDataFromSource() {
    if (GOOGLE_CONFIG.spreadsheetId && accessToken) {
        const synced = await syncFromSheets();
        if (synced) {
            return;
        }
    }
    displayHistory();
}

// Load data from localStorage
function loadData() {
    const initialized = localStorage.getItem('energyDataInitialized');

    if (!initialized) {
        const historicalData = [
            { date: '2026-02-06', meterReading: 5908, dailyUsage: 21, entryTime: '07:15' },
            { date: '2026-02-05', meterReading: 5887, dailyUsage: 22, entryTime: '07:10' },
            { date: '2026-02-04', meterReading: 5865, dailyUsage: 64, entryTime: '07:05' },
            { date: '2026-02-03', meterReading: 5801, dailyUsage: 40, entryTime: '07:12' },
            { date: '2026-02-02', meterReading: 5761, dailyUsage: 46, entryTime: '07:08' },
            { date: '2026-02-01', meterReading: 5715, dailyUsage: 46, entryTime: '07:20' },
            { date: '2026-01-31', meterReading: 5669, dailyUsage: 46, entryTime: '07:05' },
            { date: '2026-01-30', meterReading: 5623, dailyUsage: 46, entryTime: '07:18' },
            { date: '2026-01-29', meterReading: 5577, dailyUsage: 46, entryTime: '07:25' },
            { date: '2026-01-28', meterReading: 5531, dailyUsage: null, entryTime: '07:00' }
        ];

        localStorage.setItem('energyData', JSON.stringify(historicalData));
        localStorage.setItem('energyDataInitialized', 'true');
        return historicalData;
    }

    const data = localStorage.getItem('energyData');
    return data ? JSON.parse(data) : [];
}

// Save data to localStorage and Google Sheets
function saveData(data) {
    localStorage.setItem('energyData', JSON.stringify(data));

    if (GOOGLE_CONFIG.spreadsheetId && accessToken) {
        syncToSheets(data);
    }
}

// Reset to historical data
function resetData() {
    if (confirm('This will reset all data to the original historical data (Jan 28 - Feb 6). Continue?')) {
        localStorage.removeItem('energyData');
        localStorage.removeItem('energyDataInitialized');
        location.reload();
    }
}

// Update countdown timer
function updateCountdown() {
    const countdownEl = document.getElementById('countdown');
    if (!countdownEl) return;

    const now = new Date();
    const target = new Date();
    target.setHours(7, 0, 0, 0);

    if (now >= target) {
        target.setDate(target.getDate() + 1);
    }

    const diff = target - now;

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    countdownEl.textContent =
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    // Check if past due
    const currentHour = now.getHours();
    const data = loadData();

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const hasYesterdayEntry = data.some(item => item.date === yesterdayStr);

    const pastDueAlert = document.getElementById('pastDueAlert');
    if (pastDueAlert) {
        if (currentHour >= 7 && !hasYesterdayEntry) {
            pastDueAlert.classList.add('show');
        } else {
            pastDueAlert.classList.remove('show');
        }
    }
}

// Add new meter reading
function addReading() {
    const input = document.getElementById('meterReading');
    const reading = parseFloat(input.value);

    if (isNaN(reading) || reading < 0) {
        alert('Please enter a valid meter reading');
        return;
    }

    const data = loadData();
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);

    const existingIndex = data.findIndex(item => item.date === dateStr);
    if (existingIndex !== -1) {
        if (!confirm('You already have an entry for today. Do you want to replace it?')) {
            return;
        }
        data.splice(existingIndex, 1);
    }

    let dailyUsage = null;
    if (data.length > 0) {
        const lastReading = data[0].meterReading;
        dailyUsage = reading - lastReading;

        if (dailyUsage < 0) {
            alert('Current reading is less than the previous reading. Please check your input.');
            return;
        }
    }

    const entry = {
        date: dateStr,
        meterReading: reading,
        dailyUsage: dailyUsage,
        entryTime: timeStr
    };

    data.unshift(entry);
    saveData(data);

    input.value = '';
    displayHistory();
    updateCountdown();
}

// Get status based on usage
function getStatus(usage) {
    if (usage <= 30) return 'good';
    if (usage <= 35) return 'warning';
    return 'over';
}

// Get status text
function getStatusText(usage) {
    if (usage <= 30) return 'Under Target ✓';
    if (usage <= 35) return 'Slightly Over';
    return 'Over Target';
}

// Calculate and display bill estimate
function calculateBill() {
    const data = loadData();
    const billEstimateEl = document.getElementById('billEstimate');
    if (!billEstimateEl) return;

    if (data.length === 0) {
        billEstimateEl.style.display = 'none';
        return;
    }

    const unitRate = 0.25;
    const standingCharge = 0.4482;

    const billingStart = new Date('2026-01-17T00:00:00');
    const billingEnd = new Date('2026-02-17T23:59:59');
    const totalBillingDays = 32;

    const billingData = data.filter(item => {
        const itemDate = new Date(item.date + 'T12:00:00');
        return itemDate >= billingStart && itemDate <= billingEnd && item.dailyUsage !== null;
    });

    if (billingData.length === 0) {
        billEstimateEl.style.display = 'none';
        return;
    }

    const actualKwh = billingData.reduce((sum, item) => sum + item.dailyUsage, 0);
    const daysRecorded = billingData.length;
    const daysRemaining = totalBillingDays - daysRecorded;

    const avgDailyUsage = actualKwh / daysRecorded;

    const projectedRemainingKwh = avgDailyUsage * daysRemaining;
    const totalProjectedKwh = actualKwh + projectedRemainingKwh;

    const usageCost = totalProjectedKwh * unitRate;
    const standingCost = totalBillingDays * standingCharge;
    const totalBill = usageCost + standingCost;

    const previousBill = parseFloat(localStorage.getItem('previousBillEstimate')) || null;

    billEstimateEl.style.display = 'block';
    
    const billAmountEl = document.getElementById('billAmount');
    const usageCostEl = document.getElementById('usageCost');
    const standingCostEl = document.getElementById('standingCost');
    const totalKwhEl = document.getElementById('totalKwh');
    const billingDaysEl = document.getElementById('billingDays');
    
    if (billAmountEl) billAmountEl.textContent = `£${totalBill.toFixed(2)}`;
    if (usageCostEl) usageCostEl.textContent = `£${usageCost.toFixed(2)}`;
    if (standingCostEl) standingCostEl.textContent = `£${standingCost.toFixed(2)}`;
    if (totalKwhEl) totalKwhEl.textContent = Math.round(totalProjectedKwh);
    if (billingDaysEl) billingDaysEl.textContent = totalBillingDays;

    const changeIndicator = document.getElementById('billChange');
    if (changeIndicator) {
        if (previousBill !== null) {
            const difference = previousBill - totalBill;
            const absDiff = Math.abs(difference);

            if (absDiff < 0.01) {
                changeIndicator.innerHTML = `<span style="color: #94a3b8; font-weight: 600;">— £0.00</span> <span style="opacity: 0.7;">no change</span>`;
                changeIndicator.style.display = 'block';
            } else {
                const isLower = difference > 0;
                const arrow = isLower ? '↓' : '↑';
                const color = isLower ? '#059669' : '#dc2626';
                changeIndicator.innerHTML = `<span style="color: ${color}; font-weight: 600;">${arrow} £${absDiff.toFixed(2)}</span> <span style="opacity: 0.7;">from yesterday</span>`;
                changeIndicator.style.display = 'block';
            }
        } else {
            changeIndicator.style.display = 'none';
        }
    }

    localStorage.setItem('previousBillEstimate', totalBill.toFixed(2));

    const projectionText = daysRemaining > 0
        ? `Based on ${daysRecorded} days recorded (${actualKwh.toFixed(0)} kWh) + ${daysRemaining} days projected (${projectedRemainingKwh.toFixed(0)} kWh at ${avgDailyUsage.toFixed(1)} kWh/day avg)`
        : `Based on complete billing period (${daysRecorded} days)`;

    const billProjectionEl = document.getElementById('billProjection');
    if (billProjectionEl) billProjectionEl.textContent = projectionText;
}

// Render chart (desktop version with ApexCharts)
function renderChart() {
    const data = loadData();
    const chartContainer = document.getElementById('chartContainer');
    if (!chartContainer) return;

    const usageData = data.filter(item => item.dailyUsage !== null);

    if (usageData.length === 0) {
        chartContainer.style.display = 'none';
        return;
    }

    chartContainer.style.display = 'block';

    const reversedData = [...usageData].reverse();
    const labels = reversedData.map(item => {
        const date = new Date(item.date + 'T12:00:00');
        return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
    });
    const usageValues = reversedData.map(item => item.dailyUsage);

    const solarStartIndex = reversedData.findIndex(item => item.date === '2026-02-06');

    const discreteMarkers = usageValues.map((usage, index) => {
        let color;
        if (usage <= 30) {
            color = '#059669';
        } else if (usage <= 35) {
            color = '#f59e0b';
        } else {
            color = '#dc2626';
        }

        return {
            seriesIndex: 0,
            dataPointIndex: index,
            fillColor: color,
            strokeColor: color,
            size: 6
        };
    });

    if (usageChart) {
        usageChart.destroy();
    }

    const options = {
        series: [
            {
                name: 'Daily Usage',
                type: 'area',
                data: usageValues
            },
            {
                name: 'Target',
                type: 'line',
                data: new Array(usageValues.length).fill(30)
            }
        ],
        chart: {
            height: 350,
            type: 'line',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            toolbar: {
                show: true,
                tools: {
                    download: true,
                    selection: false,
                    zoom: true,
                    zoomin: true,
                    zoomout: true,
                    pan: false,
                    reset: true
                }
            },
            animations: {
                enabled: true,
                easing: 'easeinout',
                speed: 800
            },
            dropShadow: {
                enabled: true,
                color: '#0891b2',
                top: 12,
                left: 0,
                blur: 3,
                opacity: 0.2
            }
        },
        colors: ['#0891b2', '#06b6d4'],
        fill: {
            type: ['gradient', 'solid'],
            gradient: {
                shade: 'light',
                type: 'vertical',
                shadeIntensity: 0.3,
                opacityFrom: 0.5,
                opacityTo: 0.1,
                stops: [0, 90, 100]
            }
        },
        stroke: {
            width: [3, 3],
            curve: 'smooth',
            dashArray: [0, 8]
        },
        markers: {
            size: [6, 0],
            strokeWidth: 2,
            hover: {
                size: 8
            },
            discrete: discreteMarkers
        },
        xaxis: {
            categories: labels,
            labels: {
                style: {
                    fontSize: '11px',
                    fontWeight: 500
                }
            },
            axisBorder: {
                show: false
            },
            axisTicks: {
                show: false
            }
        },
        yaxis: {
            min: 0,
            title: {
                text: 'kWh',
                style: {
                    fontSize: '13px',
                    fontWeight: 600
                }
            },
            labels: {
                style: {
                    fontSize: '12px'
                },
                formatter: function(val) {
                    return val.toFixed(0);
                }
            }
        },
        grid: {
            borderColor: '#e5e7eb',
            strokeDashArray: 4,
            xaxis: {
                lines: {
                    show: false
                }
            }
        },
        legend: {
            position: 'top',
            horizontalAlign: 'center',
            fontSize: '13px',
            fontWeight: 600,
            markers: {
                width: 12,
                height: 12,
                radius: 2
            },
            itemMargin: {
                horizontal: 15
            }
        },
        tooltip: {
            shared: true,
            intersect: false,
            theme: 'dark',
            style: {
                fontSize: '13px'
            },
            y: {
                formatter: function(value, { seriesIndex, dataPointIndex }) {
                    if (seriesIndex === 1) {
                        return '30 kWh (target)';
                    }
                    const diff = value - 30;
                    const status = value <= 30 ? '✓ Under' : value <= 35 ? '⚠ Slightly over' : '✗ Over';
                    const isSolar = solarStartIndex !== -1 && dataPointIndex >= solarStartIndex;
                    let text = `${value.toFixed(1)} kWh (${diff > 0 ? '+' : ''}${diff.toFixed(1)}) ${status}`;
                    if (isSolar) {
                        text += ' ☀️';
                    }
                    return text;
                }
            }
        },
        annotations: solarStartIndex !== -1 ? {
            xaxis: [{
                x: labels[solarStartIndex],
                borderColor: '#f59e0b',
                borderWidth: 2,
                strokeDashArray: 5,
                label: {
                    borderColor: '#f59e0b',
                    style: {
                        color: '#fff',
                        background: '#f59e0b',
                        fontSize: '11px',
                        fontWeight: 600
                    },
                    text: '☀️ Solar Active',
                    position: 'top'
                }
            }]
        } : {}
    };

    usageChart = new ApexCharts(document.querySelector("#usageChart"), options);
    usageChart.render();
}

// Display history - this will be overridden by mobile version
function displayHistory() {
    const data = loadData();
    const listElement = document.getElementById('historyList');
    const summaryElement = document.getElementById('summary');
    
    if (!listElement) return;

    if (data.length === 0) {
        listElement.innerHTML = '<div class="no-data">No data yet. Enter your first meter reading above!</div>';
        if (summaryElement) summaryElement.style.display = 'none';
        return;
    }

    renderChart();
    calculateBill();

    const usageData = data.filter(item => item.dailyUsage !== null);
    if (usageData.length > 0 && summaryElement) {
        const last7Days = usageData.slice(0, 7);
        const avgUsage = last7Days.reduce((sum, item) => sum + item.dailyUsage, 0) / last7Days.length;
        const daysUnder = last7Days.filter(item => item.dailyUsage <= 30).length;

        const avgUsageEl = document.getElementById('avgUsage');
        const daysUnderEl = document.getElementById('daysUnder');
        
        if (avgUsageEl) avgUsageEl.textContent = avgUsage.toFixed(1) + ' kWh';
        if (daysUnderEl) daysUnderEl.textContent = `${daysUnder}/${last7Days.length}`;
        summaryElement.style.display = 'block';
    }

    let html = `
        <table class="history-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Daily Usage</th>
                    <th>Meter Reading</th>
                    <th>Time</th>
                    <th class="status-col">Status</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.forEach(item => {
        const date = new Date(item.date + 'T12:00:00');
        const day = String(date.getDate()).padStart(2, '0');
        const month = date.toLocaleDateString('en-GB', { month: 'short' });
        const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' });
        const dateFormatted = `${weekday} ${day} ${month}`;

        const entryTime = item.entryTime || '--:--';

        if (item.dailyUsage === null) {
            html += `
                <tr class="first-reading-row">
                    <td class="date-col">${dateFormatted}</td>
                    <td colspan="2">Baseline: ${item.meterReading.toFixed(1)} kWh</td>
                    <td>${entryTime}</td>
                    <td class="status-col">—</td>
                </tr>
            `;
        } else {
            const status = getStatus(item.dailyUsage);
            const diff = (item.dailyUsage - 30).toFixed(1);
            const diffText = item.dailyUsage <= 30 ? diff : `+${diff}`;

            html += `
                <tr>
                    <td class="date-col">${dateFormatted}</td>
                    <td class="usage-col ${status}">${item.dailyUsage.toFixed(1)} kWh <span style="font-size: 0.85em; font-weight: normal;">(${diffText})</span></td>
                    <td class="meter-col">${item.meterReading.toFixed(1)} kWh</td>
                    <td class="meter-col">${entryTime}</td>
                    <td class="status-col"><span class="status-indicator ${status}"></span></td>
                </tr>
            `;
        }
    });

    html += `
            </tbody>
        </table>
    `;

    listElement.innerHTML = html;
}

// Update Google Sheets connection status
function updateGoogleStatus() {
    const statusText = document.getElementById('statusText');
    const connectBtn = document.getElementById('connectBtn');
    const syncBtn = document.getElementById('syncBtn');
    const lastSyncText = document.getElementById('lastSyncText');

    if (!statusText) return;

    if (GOOGLE_CONFIG.spreadsheetId && accessToken) {
        statusText.textContent = '✅ Connected to Google Sheets';
        statusText.style.color = '#059669';
        if (connectBtn) connectBtn.style.display = 'none';
        if (syncBtn) syncBtn.style.display = 'block';

        if (lastSyncText) {
            const lastSync = localStorage.getItem('lastSyncTime');
            if (lastSync) {
                const syncDate = new Date(lastSync);
                const now = new Date();
                const diffMs = now - syncDate;
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMins / 60);

                let timeAgo;
                if (diffMins < 1) {
                    timeAgo = 'just now';
                } else if (diffMins < 60) {
                    timeAgo = `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
                } else if (diffHours < 24) {
                    timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
                } else {
                    timeAgo = syncDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                }
                lastSyncText.textContent = `Last synced: ${timeAgo}`;
            } else {
                lastSyncText.textContent = 'Not synced yet';
            }
        }
    } else {
        statusText.textContent = '📱 Not connected to Google Sheets';
        statusText.style.color = '#64748b';
        if (connectBtn) connectBtn.style.display = 'block';
        if (syncBtn) syncBtn.style.display = 'none';
        if (lastSyncText) lastSyncText.textContent = '';
    }
}

// Sync data from Google Sheets (manual refresh)
async function syncData() {
    const syncBtn = document.getElementById('syncBtn');
    if (!syncBtn) return;
    
    const originalText = syncBtn.textContent;

    syncBtn.textContent = '⏳ Syncing...';
    syncBtn.disabled = true;

    try {
        const synced = await syncFromSheets();
        if (synced) {
            syncBtn.textContent = '✅ Done!';
            updateGoogleStatus();
            setTimeout(() => {
                syncBtn.textContent = originalText;
            }, 2000);
        } else {
            syncBtn.textContent = '❌ Failed';
            setTimeout(() => {
                syncBtn.textContent = originalText;
            }, 2000);
        }
    } catch (error) {
        console.error('Sync error:', error);
        syncBtn.textContent = '❌ Error';
        setTimeout(() => {
            syncBtn.textContent = originalText;
        }, 2000);
    }

    syncBtn.disabled = false;
}

// Initialize app
function initApp() {
    updateCountdown();
    setInterval(updateCountdown, 1000);
    displayHistory();

    fetchWeather();
    setInterval(fetchWeather, 30 * 60 * 1000);

    setInterval(updateGoogleStatus, 1000);
}

// Google API load handlers
window.onload = function() {
    if (typeof gapi !== 'undefined') {
        gapiLoaded();
    }
    if (typeof google !== 'undefined') {
        gisLoaded();
    }
    initApp();
};
