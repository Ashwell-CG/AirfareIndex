// IATA airport codes, used only as display labels for the seven supported cities.
export const IATA = { Ahmedabad: 'AMD', Bangalore: 'BLR', Chennai: 'MAA', Delhi: 'DEL', Hyderabad: 'HYD', Kolkata: 'CCU', Mumbai: 'BOM' }
export const iata = (city) => IATA[city] ?? city.slice(0, 3).toUpperCase()
