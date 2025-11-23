// Authentication check
const userId = localStorage.getItem('userId');
const username = localStorage.getItem('username');
const role = localStorage.getItem('role');

if (!userId || !username) {
  window.location.href = 'login.html';
} else {
  document.getElementById('displayUsername').textContent = username;
  document.getElementById('displayRole').textContent = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User';
  loadUserProfile();
}

async function loadUserProfile() {
  try {
    const response = await fetch(`http://localhost:5000/api/auth/me?userId=${userId}`);
    const data = await response.json();
    if (data.success && data.user) {
      const user = data.user;
      document.getElementById('avatarInitial').textContent = user.username.charAt(0).toUpperCase();
      if (user.profile_picture) {
        const profileImage = document.getElementById('profileImage');
        profileImage.src = user.profile_picture;
        profileImage.classList.remove('hidden');
        document.getElementById('avatarInitial').classList.add('hidden');
      }
    }
  } catch (error) {
    console.error('Load profile error:', error);
  }
}

// Dropdown menu
const menuButton = document.getElementById('menuButton');
const dropdownMenu = document.getElementById('dropdownMenu');
menuButton.addEventListener('click', (e) => {
  e.stopPropagation();
  dropdownMenu.classList.toggle('show');
});
document.addEventListener('click', (e) => {
  if (!menuButton.contains(e.target) && !dropdownMenu.contains(e.target)) {
    dropdownMenu.classList.remove('show');
  }
});

function logout() {
  if (confirm("Are you sure you want to log out?")) {
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    window.location.href = "login.html";
  }
}

// Global variables
let currentReportData = {};
let charts = {};

// Switch between reports
function switchReport(reportId) {
  // Hide all reports
  document.querySelectorAll('.report-section').forEach(section => {
    section.classList.remove('active');
  });
  
  // Remove active from all tabs
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.remove('active');
  });
  
  // Show selected report
  document.getElementById(reportId).classList.add('active');
  event.target.classList.add('active');
  
  // Load data for the selected report
  switch(reportId) {
    case 'stock-summary':
      loadStockSummaryReport();
      break;
    case 'low-stock':
      loadLowStockReport();
      break;
    case 'sales-analysis':
      loadSalesAnalysisReport();
      break;
    case 'inventory-valuation':
      loadInventoryValuationReport();
      break;
  }
}

// Load filters for Stock Movement
async function loadFilters() {
  try {
    const response = await fetch('http://localhost:5000/api/reports/filters');
    const data = await response.json();
    
    if (data.success) {
      const typeSelect = document.getElementById('movement-type');
      const brandSelect = document.getElementById('movement-brand');
      
      // Populate types
      data.types.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        typeSelect.appendChild(option);
      });
      
      // Populate brands
      data.brands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        brandSelect.appendChild(option);
      });
      
      // Auto-load report with all data
      loadStockMovementReport();
    }
  } catch (error) {
    console.error('Load filters error:', error);
  }
}

// ==================== REPORT 1: STOCK SUMMARY ====================
async function loadStockSummaryReport() {
  try {
    const response = await fetch('http://localhost:5000/api/reports/stock-summary');
    const data = await response.json();
    
    if (data.success) {
      currentReportData.stockSummary = data;
      
      // Update overall cards
      document.getElementById('summary-total-products').textContent = data.overall.total_products.toLocaleString();
      document.getElementById('summary-total-quantity').textContent = data.overall.total_quantity.toLocaleString();
      document.getElementById('summary-total-value').textContent = '$' + parseFloat(data.overall.total_value).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      
      // Populate table
      const tbody = document.getElementById('stock-summary-table');
      tbody.innerHTML = data.summary.map(item => `
        <tr class="border-b border-gray-200 hover:bg-slate-50">
          <td class="py-3 px-4 font-medium text-slate-700">${item.type}</td>
          <td class="py-3 px-4 text-right text-slate-600">${item.product_count}</td>
          <td class="py-3 px-4 text-right text-slate-600">${parseInt(item.total_quantity).toLocaleString()}</td>
          <td class="py-3 px-4 text-right font-medium text-slate-700">$${parseFloat(item.total_value).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
          <td class="py-3 px-4 text-right text-slate-600">$${parseFloat(item.avg_price).toFixed(2)}</td>
          <td class="py-3 px-4 text-right text-slate-600">${item.min_quantity}</td>
          <td class="py-3 px-4 text-right text-slate-600">${item.max_quantity}</td>
        </tr>
      `).join('');
    }
  } catch (error) {
    console.error('Load stock summary error:', error);
  }
}

function exportStockSummaryPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.text('Stock Summary Report', 14, 22);
  doc.setFontSize(11);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);
  
  const data = currentReportData.stockSummary;
  if (!data) return alert('Please load the report first');
  
  // Overall summary
  doc.setFontSize(12);
  doc.text(`Total Products: ${data.overall.total_products}`, 14, 40);
  doc.text(`Total Quantity: ${data.overall.total_quantity}`, 14, 47);
  doc.text(`Total Value: $${parseFloat(data.overall.total_value).toFixed(2)}`, 14, 54);
  
  // Table
  const tableData = data.summary.map(item => [
    item.type,
    item.product_count,
    item.total_quantity,
    `$${parseFloat(item.total_value).toFixed(2)}`,
    `$${parseFloat(item.avg_price).toFixed(2)}`,
    item.min_quantity,
    item.max_quantity
  ]);
  
  doc.autoTable({
    startY: 60,
    head: [['Type', 'Count', 'Qty', 'Value', 'Avg Price', 'Min', 'Max']],
    body: tableData,
  });
  
  doc.save('stock-summary-report.pdf');
}

function exportStockSummaryExcel() {
  const data = currentReportData.stockSummary;
  if (!data) return alert('Please load the report first');
  
  const excelData = [
    ['Stock Summary Report'],
    ['Generated:', new Date().toLocaleDateString()],
    [],
    ['Overall Summary'],
    ['Total Products:', data.overall.total_products],
    ['Total Quantity:', data.overall.total_quantity],
    ['Total Value:', parseFloat(data.overall.total_value).toFixed(2)],
    [],
    ['Type', 'Product Count', 'Total Quantity', 'Total Value', 'Avg Price', 'Min Stock', 'Max Stock'],
    ...data.summary.map(item => [
      item.type,
      item.product_count,
      item.total_quantity,
      parseFloat(item.total_value).toFixed(2),
      parseFloat(item.avg_price).toFixed(2),
      item.min_quantity,
      item.max_quantity
    ])
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock Summary');
  XLSX.writeFile(wb, 'stock-summary-report.xlsx');
}

// ==================== REPORT 2: STOCK MOVEMENT ====================
async function loadStockMovementReport() {
  const startDate = document.getElementById('movement-start-date').value;
  const endDate = document.getElementById('movement-end-date').value;
  const type = document.getElementById('movement-type').value;
  const brand = document.getElementById('movement-brand').value;
  
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  if (type) params.append('type', type);
  if (brand) params.append('brand', brand);
  
  try {
    const response = await fetch(`http://localhost:5000/api/reports/stock-movement?${params}`);
    const data = await response.json();
    
    if (data.success) {
      currentReportData.stockMovement = data;
      
      // Update summary cards
      const inSummary = data.summary.find(s => s.transaction_type === 'IN');
      const outSummary = data.summary.find(s => s.transaction_type === 'OUT');
      
      document.getElementById('movement-total-in').textContent = (inSummary ? parseInt(inSummary.total_quantity) : 0).toLocaleString() + ' units';
      document.getElementById('movement-value-in').textContent = '$' + (inSummary ? parseFloat(inSummary.total_value) : 0).toLocaleString('en-US', {minimumFractionDigits: 2});
      
      document.getElementById('movement-total-out').textContent = (outSummary ? parseInt(outSummary.total_quantity) : 0).toLocaleString() + ' units';
      document.getElementById('movement-value-out').textContent = '$' + (outSummary ? parseFloat(outSummary.total_value) : 0).toLocaleString('en-US', {minimumFractionDigits: 2});
      
      // Render chart
      renderMovementChart(data.dailyTrend);
      
      // Populate table
      const tbody = document.getElementById('stock-movement-table');
      if (data.movements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-slate-400">No movements found</td></tr>';
      } else {
        tbody.innerHTML = data.movements.map(m => {
          const typeColor = m.transaction_type === 'IN' ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
          return `
            <tr class="border-b border-gray-200 hover:bg-slate-50">
              <td class="py-3 px-4 text-slate-600 text-xs">${new Date(m.created_at).toLocaleDateString('en-GB')}</td>
              <td class="py-3 px-4 text-slate-700">${m.product_name || 'Unknown'}</td>
              <td class="py-3 px-4"><span class="px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-600">${m.product_type || '-'}</span></td>
              <td class="py-3 px-4"><span class="px-2 py-1 text-xs rounded-full ${typeColor} font-medium">${m.transaction_type}</span></td>
              <td class="py-3 px-4 text-right font-medium text-slate-700">${m.quantity.toLocaleString()}</td>
              <td class="py-3 px-4 text-right font-medium text-slate-700">$${parseFloat(m.transaction_value).toFixed(2)}</td>
              <td class="py-3 px-4 text-slate-600 text-xs">${m.reference_number || '-'}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (error) {
    console.error('Load stock movement error:', error);
  }
}

function renderMovementChart(dailyTrend) {
  // Group data by date
  const dates = [...new Set(dailyTrend.map(d => d.date))].sort();
  
  // If no data, show empty chart with message
  if (dates.length === 0) {
    const ctx = document.getElementById('movementChart');
    if (charts.movement) charts.movement.destroy();
    
    charts.movement = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['No Data'],
        datasets: [
          {
            label: 'Stock IN',
            data: [0],
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            tension: 0.3
          },
          {
            label: 'Stock OUT',
            data: [0],
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            fill: true,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' },
          title: {
            display: true,
            text: 'No data available for selected filters'
          }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
    return;
  }
  
  const inData = dates.map(date => {
    const item = dailyTrend.find(d => d.date === date && d.transaction_type === 'IN');
    return item ? parseInt(item.total_quantity) : 0;
  });
  const outData = dates.map(date => {
    const item = dailyTrend.find(d => d.date === date && d.transaction_type === 'OUT');
    return item ? parseInt(item.total_quantity) : 0;
  });
  
  const labels = dates.map(d => new Date(d).toLocaleDateString('en-GB', {day: '2-digit', month: 'short'}));
  
  const ctx = document.getElementById('movementChart');
  if (charts.movement) charts.movement.destroy();
  
  charts.movement = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Stock IN',
          data: inData,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Stock OUT',
          data: outData,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: (context) => context.dataset.label + ': ' + context.parsed.y.toLocaleString() + ' units'
          }
        }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

function exportStockMovementCSV() {
  const data = currentReportData.stockMovement;
  if (!data || !data.movements) return alert('Please generate the report first');
  
  let csv = 'Date,Product,Type,Action,Quantity,Value,Reference\n';
  data.movements.forEach(m => {
    csv += `${new Date(m.created_at).toLocaleDateString('en-GB')},`;
    csv += `"${m.product_name || 'Unknown'}",`;
    csv += `${m.product_type || '-'},`;
    csv += `${m.transaction_type},`;
    csv += `${m.quantity},`;
    csv += `${parseFloat(m.transaction_value).toFixed(2)},`;
    csv += `"${m.reference_number || '-'}"\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'stock-movement-report.csv';
  a.click();
}

function exportStockMovementPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  const data = currentReportData.stockMovement;
  if (!data) return alert('Please generate the report first');
  
  doc.setFontSize(18);
  doc.text('Stock Movement Report', 14, 22);
  doc.setFontSize(11);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);
  
  const tableData = data.movements.slice(0, 50).map(m => [
    new Date(m.created_at).toLocaleDateString('en-GB'),
    m.product_name || 'Unknown',
    m.transaction_type,
    m.quantity,
    `$${parseFloat(m.transaction_value).toFixed(2)}`
  ]);
  
  doc.autoTable({
    startY: 40,
    head: [['Date', 'Product', 'Action', 'Qty', 'Value']],
    body: tableData,
  });
  
  doc.save('stock-movement-report.pdf');
}

// ==================== REPORT 3: LOW STOCK ====================
async function loadLowStockReport() {
  try {
    const response = await fetch('http://localhost:5000/api/reports/low-stock?threshold=50');
    const data = await response.json();
    
    if (data.success) {
      currentReportData.lowStock = data;
      
      // Calculate totals
      const totalQty = data.lowStockItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalValue = data.lowStockItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      
      document.getElementById('lowstock-count').textContent = data.totalLowStockItems;
      document.getElementById('lowstock-total-qty').textContent = totalQty.toLocaleString();
      document.getElementById('lowstock-total-value').textContent = '$' + totalValue.toLocaleString('en-US', {minimumFractionDigits: 2});
      
      // Populate table
      const tbody = document.getElementById('low-stock-table');
      if (data.lowStockItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-green-600">✓ All items well stocked!</td></tr>';
      } else {
        tbody.innerHTML = data.lowStockItems.map(item => `
          <tr class="border-b border-gray-200 hover:bg-slate-50">
            <td class="py-3 px-4">
              <div class="flex items-center gap-2">
                <img src="${item.image || 'https://via.placeholder.com/32'}" class="w-8 h-8 rounded object-cover" />
                <span class="text-slate-700 font-medium">${item.name}</span>
              </div>
            </td>
            <td class="py-3 px-4 text-slate-600 text-xs">${item.code}</td>
            <td class="py-3 px-4"><span class="px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-600">${item.type}</span></td>
            <td class="py-3 px-4 text-slate-600">${item.brand || '-'}</td>
            <td class="py-3 px-4 text-right">
              <span class="font-bold ${item.quantity === 0 ? 'text-red-600' : item.quantity < 20 ? 'text-orange-600' : 'text-yellow-600'}">${item.quantity}</span>
            </td>
            <td class="py-3 px-4 text-right">
              <span class="px-2 py-1 text-xs rounded-full bg-blue-50 text-blue-600 font-medium">${item.suggested_order_qty}</span>
            </td>
            <td class="py-3 px-4 text-slate-600 text-xs">${item.last_restock_date ? new Date(item.last_restock_date).toLocaleDateString('en-GB') : 'Never'}</td>
            <td class="py-3 px-4 text-right text-slate-600">${item.out_last_30_days || 0}</td>
          </tr>
        `).join('');
      }
    }
  } catch (error) {
    console.error('Load low stock error:', error);
  }
}

function exportLowStockPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('landscape');
  
  const data = currentReportData.lowStock;
  if (!data) return alert('Please load the report first');
  
  doc.setFontSize(18);
  doc.text('Low Stock Report - Purchase Order', 14, 22);
  doc.setFontSize(11);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);
  doc.text(`Threshold: Items with stock < 50 units`, 14, 36);
  
  const tableData = data.lowStockItems.map(item => [
    item.name,
    item.code,
    item.type,
    item.brand || '-',
    item.quantity,
    item.suggested_order_qty,
    item.out_last_30_days || 0
  ]);
  
  doc.autoTable({
    startY: 42,
    head: [['Product', 'Code', 'Type', 'Brand', 'Stock', 'Order Qty', 'Sold (30d)']],
    body: tableData,
  });
  
  doc.save('low-stock-purchase-order.pdf');
}

// ==================== REPORT 4: SALES ANALYSIS ====================
async function loadSalesAnalysisReport() {
  try {
    const response = await fetch('http://localhost:5000/api/reports/sales-analysis?limit=20');
    const data = await response.json();
    
    if (data.success) {
      currentReportData.salesAnalysis = data;
      
      // Render charts
      renderMonthlySalesChart(data.monthlySales);
      renderSalesByTypeChart(data.salesByType);
      
      // Top selling table
      const topSellingTbody = document.getElementById('top-selling-table');
      topSellingTbody.innerHTML = data.topSelling.map((item, index) => `
        <tr class="border-b border-gray-200 hover:bg-slate-50">
          <td class="py-3 px-4 text-center">
            <span class="w-6 h-6 rounded-full ${index < 3 ? 'bg-yellow-100 text-yellow-600' : 'bg-slate-100 text-slate-600'} inline-flex items-center justify-center text-xs font-bold">${index + 1}</span>
          </td>
          <td class="py-3 px-4">
            <div class="flex items-center gap-2">
              <img src="${item.image || 'https://via.placeholder.com/32'}" class="w-8 h-8 rounded object-cover" />
              <span class="text-slate-700 font-medium">${item.name}</span>
            </div>
          </td>
          <td class="py-3 px-4"><span class="px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-600">${item.type}</span></td>
          <td class="py-3 px-4 text-right font-bold text-green-600">${parseInt(item.total_sold).toLocaleString()}</td>
          <td class="py-3 px-4 text-right font-medium text-slate-700">$${parseFloat(item.total_sales_value).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
          <td class="py-3 px-4 text-right text-slate-600">${item.current_stock}</td>
        </tr>
      `).join('');
      
      // Slow moving table
      const slowMovingTbody = document.getElementById('slow-moving-table');
      if (data.slowMoving.length === 0) {
        slowMovingTbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400">No slow-moving items found</td></tr>';
      } else {
        slowMovingTbody.innerHTML = data.slowMoving.map(item => `
          <tr class="border-b border-gray-200 hover:bg-slate-50">
            <td class="py-3 px-4">
              <div class="flex items-center gap-2">
                <img src="${item.image || 'https://via.placeholder.com/32'}" class="w-8 h-8 rounded object-cover" />
                <span class="text-slate-700">${item.name}</span>
              </div>
            </td>
            <td class="py-3 px-4"><span class="px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-600">${item.type}</span></td>
            <td class="py-3 px-4 text-right text-slate-600">${item.quantity}</td>
            <td class="py-3 px-4 text-right text-orange-600">${parseInt(item.total_sold)}</td>
            <td class="py-3 px-4 text-right text-slate-600">${item.days_in_inventory} days</td>
          </tr>
        `).join('');
      }

      // Top Brands by Category
      displayTopBrandsByCategory(data.topBrandsByCategory);
    }
  } catch (error) {
    console.error('Load sales analysis error:', error);
  }
}

function renderMonthlySalesChart(monthlySales) {
  const labels = monthlySales.map(m => {
    const [year, month] = m.month.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[parseInt(month) - 1]} ${year.slice(2)}`;
  });
  const values = monthlySales.map(m => parseFloat(m.total_value));
  
  const ctx = document.getElementById('monthlySalesChart');
  if (charts.monthlySales) charts.monthlySales.destroy();
  
  charts.monthlySales = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Sales Value',
        data: values,
        backgroundColor: '#60a5fa',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => '$' + context.parsed.y.toLocaleString('en-US', {minimumFractionDigits: 2})
          }
        }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

function renderSalesByTypeChart(salesByType) {
  const labels = salesByType.map(s => s.type);
  const values = salesByType.map(s => parseFloat(s.total_value));
  
  const ctx = document.getElementById('salesByTypeChart');
  if (charts.salesByType) charts.salesByType.destroy();
  
  charts.salesByType = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: [
          '#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f87171',
          '#fb923c', '#818cf8', '#22d3ee', '#a3e635', '#fb7185'
        ]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right' },
        tooltip: {
          callbacks: {
            label: (context) => context.label + ': $' + context.parsed.toLocaleString('en-US', {minimumFractionDigits: 2})
          }
        }
      }
    }
  });
}

function displayTopBrandsByCategory(brandsData) {
  const container = document.getElementById('brands-by-category-container');
  
  if (!brandsData || brandsData.length === 0) {
    container.innerHTML = '<div class="text-center py-4 text-slate-400">No brand data available</div>';
    return;
  }

  // Group by category
  const categories = {};
  brandsData.forEach(item => {
    if (!categories[item.type]) {
      categories[item.type] = [];
    }
    categories[item.type].push(item);
  });

  // Generate HTML for each category
  let html = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">';
  
  Object.keys(categories).forEach(categoryName => {
    const brands = categories[categoryName].slice(0, 5); // Top 5 brands per category
    const totalCategorySales = brands.reduce((sum, b) => sum + parseFloat(b.total_value), 0);
    
    html += `
      <div class="border border-gray-200 rounded-lg p-4 bg-gradient-to-br from-slate-50 to-white">
        <h4 class="font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <span class="px-2 py-1 text-xs rounded-full bg-sky-100 text-sky-700">${categoryName}</span>
          <span class="text-xs text-slate-400">$${totalCategorySales.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
        </h4>
        <div class="space-y-2">
          ${brands.map((brand, idx) => {
            const percentage = totalCategorySales > 0 ? (parseFloat(brand.total_value) / totalCategorySales * 100) : 0;
            const barColor = idx === 0 ? 'bg-yellow-400' : idx === 1 ? 'bg-blue-400' : 'bg-slate-300';
            
            return `
              <div class="group hover:bg-slate-50 p-2 rounded transition">
                <div class="flex items-center justify-between mb-1">
                  <div class="flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full ${idx < 2 ? 'bg-yellow-100 text-yellow-600' : 'bg-slate-100 text-slate-600'} inline-flex items-center justify-center text-xs font-bold">${idx + 1}</span>
                    <span class="font-medium text-slate-700 text-sm">${brand.brand}</span>
                  </div>
                  <span class="text-xs text-slate-500">${parseInt(brand.total_sold).toLocaleString()} sold</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="flex-1 bg-gray-200 rounded-full h-2">
                    <div class="${barColor} h-2 rounded-full transition-all duration-300" style="width: ${percentage}%"></div>
                  </div>
                  <span class="text-xs font-medium text-slate-600 w-12 text-right">$${parseFloat(brand.total_value).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        ${brands.length === 0 ? '<div class="text-center text-xs text-slate-400 py-2">No sales data</div>' : ''}
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

function exportSalesAnalysisPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  const data = currentReportData.salesAnalysis;
  if (!data) return alert('Please load the report first');
  
  doc.setFontSize(18);
  doc.text('Sales Analysis Report', 14, 22);
  doc.setFontSize(11);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);
  
  // Top selling
  doc.setFontSize(14);
  doc.text('Top Selling Products', 14, 42);
  
  const topSellingData = data.topSelling.slice(0, 15).map((item, idx) => [
    idx + 1,
    item.name,
    item.type,
    item.total_sold,
    `$${parseFloat(item.total_sales_value).toFixed(2)}`
  ]);
  
  doc.autoTable({
    startY: 48,
    head: [['#', 'Product', 'Type', 'Sold', 'Value']],
    body: topSellingData,
  });
  
  doc.save('sales-analysis-report.pdf');
}

// ==================== REPORT 5: INVENTORY VALUATION ====================
async function loadInventoryValuationReport() {
  try {
    const response = await fetch('http://localhost:5000/api/reports/inventory-valuation');
    const data = await response.json();
    
    if (data.success) {
      currentReportData.inventoryValuation = data;
      
      // Update cards
      document.getElementById('valuation-total-products').textContent = data.current.overall.total_products.toLocaleString();
      document.getElementById('valuation-total-quantity').textContent = data.current.overall.total_quantity.toLocaleString();
      document.getElementById('valuation-total-value').textContent = '$' + parseFloat(data.current.overall.total_value).toLocaleString('en-US', {minimumFractionDigits: 2});
      
      // Render chart
      renderValuationChart(data.current.byType);
      
      // Valuation by type table
      const byTypeTbody = document.getElementById('valuation-by-type-table');
      byTypeTbody.innerHTML = data.current.byType.map(item => `
        <tr class="border-b border-gray-200 hover:bg-slate-50">
          <td class="py-3 px-4 font-medium text-slate-700">${item.type}</td>
          <td class="py-3 px-4 text-right text-slate-600">${item.product_count}</td>
          <td class="py-3 px-4 text-right text-slate-600">${parseInt(item.total_quantity).toLocaleString()}</td>
          <td class="py-3 px-4 text-right font-medium text-slate-700">$${parseFloat(item.total_value).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
          <td class="py-3 px-4 text-right text-slate-600">$${parseFloat(item.avg_price).toFixed(2)}</td>
        </tr>
      `).join('');
      
      // Top value products
      const topValueTbody = document.getElementById('top-value-table');
      topValueTbody.innerHTML = data.topValueProducts.map((item, index) => `
        <tr class="border-b border-gray-200 hover:bg-slate-50">
          <td class="py-3 px-4 text-center text-slate-600">${index + 1}</td>
          <td class="py-3 px-4">
            <div class="flex items-center gap-2">
              <img src="${item.image || 'https://via.placeholder.com/32'}" class="w-8 h-8 rounded object-cover" />
              <span class="text-slate-700 font-medium">${item.name}</span>
            </div>
          </td>
          <td class="py-3 px-4"><span class="px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-600">${item.type}</span></td>
          <td class="py-3 px-4 text-right text-slate-600">$${parseFloat(item.price).toFixed(2)}</td>
          <td class="py-3 px-4 text-right text-slate-600">${item.quantity}</td>
          <td class="py-3 px-4 text-right font-bold text-green-600">$${parseFloat(item.total_value).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        </tr>
      `).join('');
    }
  } catch (error) {
    console.error('Load inventory valuation error:', error);
  }
}

function renderValuationChart(byType) {
  const labels = byType.map(item => item.type);
  const values = byType.map(item => parseFloat(item.total_value));
  
  const ctx = document.getElementById('valuationChart');
  if (charts.valuation) charts.valuation.destroy();
  
  charts.valuation = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Total Value',
        data: values,
        backgroundColor: '#a78bfa',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => '$' + context.parsed.x.toLocaleString('en-US', {minimumFractionDigits: 2})
          }
        }
      },
      scales: {
        x: { beginAtZero: true }
      }
    }
  });
}

function exportValuationPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  const data = currentReportData.inventoryValuation;
  if (!data) return alert('Please load the report first');
  
  doc.setFontSize(18);
  doc.text('Inventory Valuation Report', 14, 22);
  doc.setFontSize(11);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);
  
  doc.setFontSize(12);
  doc.text(`Total Products: ${data.current.overall.total_products}`, 14, 40);
  doc.text(`Total Value: $${parseFloat(data.current.overall.total_value).toFixed(2)}`, 14, 47);
  
  const tableData = data.current.byType.map(item => [
    item.type,
    item.product_count,
    item.total_quantity,
    `$${parseFloat(item.total_value).toFixed(2)}`,
    `$${parseFloat(item.avg_price).toFixed(2)}`
  ]);
  
  doc.autoTable({
    startY: 54,
    head: [['Type', 'Count', 'Qty', 'Value', 'Avg Price']],
    body: tableData,
  });
  
  doc.save('inventory-valuation-report.pdf');
}

// Initialize - Load first report
loadStockSummaryReport();
