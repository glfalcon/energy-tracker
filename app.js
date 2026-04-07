// Energy Tracker - Shared Application Logic
// This file contains all the business logic shared between desktop and mobile versions

let usageChart = null;

// Google Sheets configuration
const GOOGLE_CONFIG = {
    clientId: '531203228430-94fbaf0bc30tkp211gvac6ihbk4cc1do.apps.googleusercontent.com',
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

// Fetch historical weather for a specific date (for storing with readings)
async function fetchWeatherForDate(dateStr) {
    try {
        const params = new URLSearchParams({
            latitude: WEATHER_CONFIG.latitude,
            longitude: WEATHER_CONFIG.longitude,
            daily: 'temperature_2m_max,temperature_2m_min,weather_code',
            timezone: 'Europe/London',
            start_date: dateStr,
            end_date: dateStr
        });

        const response = await fetch(`${WEATHER_CONFIG.url}?${params}`);
        if (!response.ok) return null;

        const data = await response.json();
        if (!data.daily || !data.daily.temperature_2m_max) return null;

        const weatherCode = data.daily.weather_code[0];
        const weather = getWeatherInfo(weatherCode);

        return {
            high: Math.round(data.daily.temperature_2m_max[0]),
            low: Math.round(data.daily.temperature_2m_min[0]),
            condition: `${weather.icon} ${weather.desc}`
        };
    } catch (error) {
        console.error('Error fetching weather for date:', error);
        return null;
    }
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
            item.entryTime || '',
            item.weatherHigh != null ? item.weatherHigh : '',
            item.weatherLow != null ? item.weatherLow : '',
            item.weatherCondition || ''
        ]);

        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: GOOGLE_CONFIG.spreadsheetId,
            range: 'Daily Readings!A2:G'
        });

        // Ensure header row includes weather columns
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: GOOGLE_CONFIG.spreadsheetId,
            range: 'Daily Readings!A1:G1',
            valueInputOption: 'RAW',
            resource: {
                values: [['Date', 'Meter Reading', 'Daily Usage', 'Entry Time', 'High °C', 'Low °C', 'Condition']]
            }
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
            range: 'Daily Readings!A2:G',
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
            entryTime: row[3] || null,
            weatherHigh: row[4] ? parseFloat(row[4]) : null,
            weatherLow: row[5] ? parseFloat(row[5]) : null,
            weatherCondition: row[6] || null
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

    // Use YESTERDAY's date since we're recording yesterday's usage
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);

    const existingIndex = data.findIndex(item => item.date === dateStr);
    if (existingIndex !== -1) {
        if (!confirm('You already have an entry for yesterday. Do you want to replace it?')) {
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

    // Fetch and store weather for yesterday (async, non-blocking)
    fetchWeatherForDate(dateStr).then(weather => {
        if (weather) {
            entry.weatherHigh = weather.high;
            entry.weatherLow = weather.low;
            entry.weatherCondition = weather.condition;
            saveData(data);
        }
    });

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

    // Dynamic billing period — cycles on the 17th of each month
    const now = new Date();
    let billingStart, billingEnd;
    if (now.getDate() >= 17) {
        billingStart = new Date(now.getFullYear(), now.getMonth(), 17);
        billingEnd = new Date(now.getFullYear(), now.getMonth() + 1, 17);
    } else {
        billingStart = new Date(now.getFullYear(), now.getMonth() - 1, 17);
        billingEnd = new Date(now.getFullYear(), now.getMonth(), 17);
    }
    billingStart.setHours(0, 0, 0, 0);
    billingEnd.setHours(23, 59, 59, 999);
    const totalBillingDays = Math.round((billingEnd - billingStart) / (1000 * 60 * 60 * 24));

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

    // Update bill title with dynamic billing period dates
    const billTitleEl = document.getElementById('billTitle');
    if (billTitleEl) {
        const endDateStr = billingEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        billTitleEl.textContent = `Estimated Bill for ${endDateStr}`;
    }

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

    fetchBillStatus();
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
                    // Add weather if available
                    const item = reversedData[dataPointIndex];
                    if (item && item.weatherHigh != null) {
                        text += ` | ↑${item.weatherHigh}° ↓${item.weatherLow}°`;
                        if (item.weatherCondition) {
                            text += ` ${item.weatherCondition}`;
                        }
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
    // Reset previousBillEstimate if billing period has changed
    const lastBillingPeriod = localStorage.getItem('currentBillingPeriod');
    const now = new Date();
    let currentPeriodStart;
    if (now.getDate() >= 17) {
        currentPeriodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-17`;
    } else {
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 17);
        currentPeriodStart = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-17`;
    }
    if (lastBillingPeriod !== currentPeriodStart) {
        localStorage.removeItem('previousBillEstimate');
        localStorage.setItem('currentBillingPeriod', currentPeriodStart);

        // Check if previous period should be auto-archived
        if (lastBillingPeriod && accessToken) {
            checkAndArchivePreviousPeriod(lastBillingPeriod);
        }
    }

    updateCountdown();
    setInterval(updateCountdown, 10000);
    displayHistory();

    fetchWeather();
    setInterval(fetchWeather, 30 * 60 * 1000);

    setInterval(updateGoogleStatus, 30000);
}

// Auto-archive previous billing period (conservative — checks before writing)
async function checkAndArchivePreviousPeriod(periodStartStr) {
    try {
        // Check if Monthly Bills tab exists
        const sheetMeta = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: GOOGLE_CONFIG.spreadsheetId
        });
        const sheets = sheetMeta.result.sheets;
        const monthlyBillsExists = sheets.some(s => s.properties.title === 'Monthly Bills');

        if (!monthlyBillsExists) return; // Don't auto-create tab, user should do that first

        // Check if this period was already archived
        const existing = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_CONFIG.spreadsheetId,
            range: 'Monthly Bills!B:B',
        });

        const startDates = existing.result.values || [];
        if (startDates.some(row => row[0] === periodStartStr)) {
            return; // Already archived
        }

        // Calculate previous period data
        const prevStart = new Date(periodStartStr + 'T00:00:00');
        const now = new Date();
        let prevEnd;
        if (now.getDate() >= 17) {
            prevEnd = new Date(now.getFullYear(), now.getMonth(), 17);
        } else {
            prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 17);
        }
        prevEnd.setDate(prevEnd.getDate() - 1); // End day before new period start

        const data = loadData();
        const periodData = data.filter(item => {
            const d = new Date(item.date + 'T12:00:00');
            return d >= prevStart && d <= prevEnd && item.dailyUsage !== null;
        });

        if (periodData.length === 0) return;

        const totalKwh = periodData.reduce((sum, item) => sum + item.dailyUsage, 0);
        const totalDays = Math.round((prevEnd - prevStart) / (1000 * 60 * 60 * 24)) + 1;
        const usageCost = totalKwh * 0.25;
        const standingCost = totalDays * 0.4482;
        const totalBill = usageCost + standingCost;

        const startStr = prevStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const endStr = prevEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const periodLabel = `${startStr} – ${endStr}`;

        // Find next empty row
        const allRows = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_CONFIG.spreadsheetId,
            range: 'Monthly Bills!A:A',
        });
        const nextRow = (allRows.result.values ? allRows.result.values.length : 0) + 1;

        const archiveRow = [
            periodLabel,
            periodStartStr,
            prevEnd.toISOString().split('T')[0],
            totalDays,
            periodData.length,
            Math.round(totalKwh * 10) / 10,
            Math.round((totalKwh / periodData.length) * 10) / 10,
            Math.round(usageCost * 100) / 100,
            Math.round(standingCost * 100) / 100,
            Math.round(totalBill * 100) / 100,
            new Date().toISOString().split('T')[0],
            '', // Bill Received (empty)
            '', // Actual Amount (empty)
            '', // Charge Date (empty)
            ''  // Difference (empty)
        ];

        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: GOOGLE_CONFIG.spreadsheetId,
            range: `Monthly Bills!A${nextRow}:O${nextRow}`,
            valueInputOption: 'RAW',
            resource: { values: [archiveRow] }
        });

        console.log('Auto-archived billing period:', periodLabel);
    } catch (err) {
        console.error('Auto-archive error:', err);
    }
}

// Bill status — last fetched status object, used for modal pre-population
let _lastBillStatus = null;

// Fetch bill status from Monthly Bills sheet (or localStorage cache)
async function fetchBillStatus() {
    let status = null;

    // Determine current billing period start for staleness check
    const now = new Date();
    let currentPeriodStart;
    if (now.getDate() >= 17) {
        currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 17);
    } else {
        currentPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 17);
    }

    if (accessToken) {
        try {
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: GOOGLE_CONFIG.spreadsheetId,
                range: 'Monthly Bills!A2:O',
            });

            const rows = response.result.values || [];
            if (rows.length > 0) {
                const lastRow = rows[rows.length - 1];
                const periodLabel = lastRow[0] || '';
                const periodStartStr = lastRow[1] || '';
                const estimatedAmount = parseFloat(lastRow[9]) || 0;
                const billReceived = lastRow[11] || '';
                const actualAmount = lastRow[12] ? parseFloat(lastRow[12]) : null;
                const chargeDate = lastRow[13] || '';
                const difference = lastRow[14] ? parseFloat(lastRow[14]) : null;

                // Staleness check: compare row's period start with current period
                const rowPeriodStart = periodStartStr ? new Date(periodStartStr + 'T00:00:00') : null;
                const isCurrentPeriod = rowPeriodStart && rowPeriodStart.getTime() === currentPeriodStart.getTime();

                if (isCurrentPeriod || !periodStartStr) {
                    status = {
                        logged: !!billReceived && actualAmount !== null,
                        periodLabel: periodLabel,
                        estimatedAmount: estimatedAmount,
                        actualAmount: actualAmount,
                        chargeDate: chargeDate,
                        difference: difference,
                        cached: false
                    };
                }
            }

            if (status) {
                localStorage.setItem('billStatusCache', JSON.stringify(status));
            }
        } catch (err) {
            console.error('Error fetching bill status:', err);
            if (err.status === 401 || err.status === 403) {
                const cached = localStorage.getItem('billStatusCache');
                if (cached) {
                    try {
                        status = JSON.parse(cached);
                        status.cached = true;
                    } catch (e) { /* ignore */ }
                }
            }
        }
    } else {
        const cached = localStorage.getItem('billStatusCache');
        if (cached) {
            try {
                status = JSON.parse(cached);
                status.cached = true;
            } catch (e) { /* ignore */ }
        }
    }

    _lastBillStatus = status;
    updateBillStatusUI(status);
}

// Render bill status badge into #billStatus
function updateBillStatusUI(status) {
    const el = document.getElementById('billStatus');
    const btn = document.getElementById('logBillBtn');
    if (!el) return;

    if (!status) {
        el.style.display = 'none';
        if (btn) btn.textContent = '📝 Log Actual Bill';
        return;
    }

    const cachedLabel = status.cached ? ' <span style="opacity:0.6;font-weight:400;">(cached)</span>' : '';

    if (status.logged) {
        const diffAbs = Math.abs(status.difference || 0);
        const diffDir = (status.difference || 0) >= 0 ? 'under' : 'over';
        const diffText = status.difference !== null
            ? ` (£${diffAbs.toFixed(2)} ${diffDir} estimate)`
            : '';

        const chargeLabel = status.chargeDate
            ? (() => {
                const d = new Date(status.chargeDate + 'T12:00:00');
                return ` on ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`;
            })()
            : '';

        el.style.display = 'block';
        el.style.background = 'rgba(5,150,105,0.15)';
        el.style.color = '#6ee7b7';
        el.innerHTML = `✅ Bill logged: £${status.actualAmount.toFixed(2)}${chargeLabel}${diffText}${cachedLabel}`;

        if (btn) btn.textContent = '✏️ Update Bill';
    } else {
        el.style.display = 'block';
        el.style.background = 'rgba(245,158,11,0.15)';
        el.style.color = '#fcd34d';
        el.innerHTML = `⏳ Awaiting actual bill for ${status.periodLabel}${cachedLabel}`;

        if (btn) btn.textContent = '📝 Log Actual Bill';
    }
}

// Log actual bill amount against archived period
async function logActualBill(actualAmount, chargeDate) {
    if (!accessToken) {
        alert('Please connect to Google Sheets first.');
        return false;
    }

    try {
        // Read Monthly Bills to find the latest row without an actual amount
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_CONFIG.spreadsheetId,
            range: 'Monthly Bills!A2:O',
        });

        const rows = response.result.values || [];
        let targetRow = -1;

        // Find the most recent row without an actual amount
        for (let i = rows.length - 1; i >= 0; i--) {
            if (!rows[i][12]) { // Column M (Actual Amount) is empty
                targetRow = i + 2; // +2 for header and 0-indexing
                break;
            }
        }

        if (targetRow === -1) {
            alert('No pending billing period found to log against.');
            return false;
        }

        const estTotal = parseFloat(rows[targetRow - 2][9]) || 0;
        const difference = Math.round((estTotal - actualAmount) * 100) / 100;

        // Update columns L, M, N, O (Bill Received, Actual Amount, Charge Date, Difference)
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: GOOGLE_CONFIG.spreadsheetId,
            range: `Monthly Bills!L${targetRow}:O${targetRow}`,
            valueInputOption: 'RAW',
            resource: {
                values: [['Yes', actualAmount, chargeDate, difference]]
            }
        });

        return true;
    } catch (err) {
        console.error('Error logging actual bill:', err);
        alert('Error saving bill. Check console for details.');
        return false;
    }
}

// Show actual bill modal
function showActualBillModal() {
    const existing = document.getElementById('actualBillModal');
    if (existing) existing.remove();

    const isEditing = _lastBillStatus && _lastBillStatus.logged;
    const modalTitle = isEditing ? '✏️ Update Bill' : '📝 Log Actual Bill';
    const prefillAmount = isEditing && _lastBillStatus.actualAmount ? _lastBillStatus.actualAmount : '';
    const prefillDate = isEditing && _lastBillStatus.chargeDate ? _lastBillStatus.chargeDate : new Date().toISOString().split('T')[0];

    const modal = document.createElement('div');
    modal.id = 'actualBillModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
        <div style="background:white;border-radius:15px;padding:25px;max-width:350px;width:100%;">
            <h3 style="color:#0891b2;margin-bottom:15px;">${modalTitle}</h3>
            <div style="margin-bottom:12px;">
                <label style="display:block;font-weight:600;margin-bottom:5px;color:#555;">Actual Amount (£)</label>
                <input type="number" id="actualBillAmount" step="0.01" placeholder="e.g., 342.50" value="${prefillAmount}" style="width:100%;padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-size:1.1em;">
            </div>
            <div style="margin-bottom:15px;">
                <label style="display:block;font-weight:600;margin-bottom:5px;color:#555;">Charge Date</label>
                <input type="date" id="actualBillDate" value="${prefillDate}" style="width:100%;padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-size:1em;">
            </div>
            <div style="display:flex;gap:10px;">
                <button onclick="submitActualBill()" style="flex:1;padding:12px;background:linear-gradient(135deg,#06b6d4,#0891b2);color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;">Save</button>
                <button onclick="document.getElementById('actualBillModal').remove()" style="flex:1;padding:12px;background:#64748b;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('actualBillAmount').focus();
}

// Submit actual bill
async function submitActualBill() {
    const amount = parseFloat(document.getElementById('actualBillAmount').value);
    const date = document.getElementById('actualBillDate').value;

    if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid amount.');
        return;
    }

    if (!date) {
        alert('Please enter the charge date.');
        return;
    }

    const success = await logActualBill(amount, date);
    if (success) {
        document.getElementById('actualBillModal').remove();

        const estimatedAmount = _lastBillStatus ? _lastBillStatus.estimatedAmount : 0;
        const difference = Math.round((estimatedAmount - amount) * 100) / 100;

        const status = {
            logged: true,
            periodLabel: _lastBillStatus ? _lastBillStatus.periodLabel : '',
            estimatedAmount: estimatedAmount,
            actualAmount: amount,
            chargeDate: date,
            difference: difference,
            cached: false
        };

        _lastBillStatus = status;
        localStorage.setItem('billStatusCache', JSON.stringify(status));
        updateBillStatusUI(status);
    }
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
