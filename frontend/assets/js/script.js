const ctx = document.getElementById('stockChart');

new Chart(ctx, {
  type: 'bar',
  data: {
    labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    datasets: [
      { label: 'Stock In', data: [8000,12000,10000,16000,9000,7000,11000,14000,10000,13000,9000,8000], backgroundColor: '#4dabf7' },
      { label: 'Stock Out', data: [4000,8000,6000,10000,7000,5000,9000,10000,8000,9000,6000,5000], backgroundColor: '#9b59b6' }
    ]
  },
  options: {
    responsive: true,
    plugins: { legend: { position: 'top' } },
    scales: { y: { beginAtZero: true } }
  }
});
