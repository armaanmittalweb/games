// GeoGuess places: every country (outlines in geo-shapes.ts), well-known capitals and popular cities.
// Countries are found when the pin lands inside them; capitals and cities score by distance from the pin.
import { SHAPES } from './geo-shapes'

export interface Place { kind: 'country' | 'capital' | 'city'; n: string; of?: string; lat: number; lon: number; /** A country's name in geo-shapes.ts. */ shape?: string }

/** Natural Earth's names, as people say them. */
const SAY: Record<string, string> = {
  "People's Republic of China": 'China', 'United States of America': 'United States', 'The Gambia': 'Gambia', 'The Bahamas': 'Bahamas',
  'Republic of the Congo': 'Congo', 'Democratic Republic of the Congo': 'DR Congo', 'Federated States of Micronesia': 'Micronesia',
  'East Timor': 'Timor-Leste', 'Czech Republic': 'Czechia',
}
export const sayCountry = (n: string) => SAY[n] ?? n

export const COUNTRIES: Place[] = SHAPES.map(s => ({ kind: 'country', n: sayCountry(s.n), lat: s.lat, lon: s.lon, shape: s.n }))

const C = (n: string, of: string, lat: number, lon: number): Place => ({ kind: 'capital', n, of, lat, lon })
export const CAPITALS: Place[] = [
  C('New Delhi', 'India', 28.61, 77.21), C('Washington, D.C.', 'United States', 38.9, -77.04), C('London', 'United Kingdom', 51.51, -0.13),
  C('Paris', 'France', 48.86, 2.35), C('Berlin', 'Germany', 52.52, 13.4), C('Rome', 'Italy', 41.9, 12.5), C('Madrid', 'Spain', 40.42, -3.7),
  C('Lisbon', 'Portugal', 38.72, -9.14), C('Amsterdam', 'Netherlands', 52.37, 4.9), C('Brussels', 'Belgium', 50.85, 4.35),
  C('Vienna', 'Austria', 48.21, 16.37), C('Bern', 'Switzerland', 46.95, 7.45), C('Prague', 'Czechia', 50.08, 14.44), C('Warsaw', 'Poland', 52.23, 21.01),
  C('Budapest', 'Hungary', 47.5, 19.04), C('Athens', 'Greece', 37.98, 23.73), C('Stockholm', 'Sweden', 59.33, 18.07), C('Oslo', 'Norway', 59.91, 10.75),
  C('Copenhagen', 'Denmark', 55.68, 12.57), C('Helsinki', 'Finland', 60.17, 24.94), C('Dublin', 'Ireland', 53.35, -6.26), C('Reykjavik', 'Iceland', 64.15, -21.94),
  C('Moscow', 'Russia', 55.76, 37.62), C('Kyiv', 'Ukraine', 50.45, 30.52), C('Bucharest', 'Romania', 44.43, 26.1), C('Sofia', 'Bulgaria', 42.7, 23.32),
  C('Belgrade', 'Serbia', 44.79, 20.45), C('Zagreb', 'Croatia', 45.81, 15.98), C('Ankara', 'Turkey', 39.93, 32.86), C('Tehran', 'Iran', 35.69, 51.39),
  C('Baghdad', 'Iraq', 33.31, 44.37), C('Riyadh', 'Saudi Arabia', 24.71, 46.68), C('Abu Dhabi', 'United Arab Emirates', 24.45, 54.38), C('Doha', 'Qatar', 25.29, 51.53),
  C('Muscat', 'Oman', 23.59, 58.41), C('Kuwait City', 'Kuwait', 29.38, 47.99), C('Amman', 'Jordan', 31.95, 35.93),
  C('Beirut', 'Lebanon', 33.89, 35.5), C('Damascus', 'Syria', 33.51, 36.29), C('Cairo', 'Egypt', 30.04, 31.24), C('Kabul', 'Afghanistan', 34.53, 69.17),
  C('Islamabad', 'Pakistan', 33.68, 73.05), C('Kathmandu', 'Nepal', 27.72, 85.32), C('Thimphu', 'Bhutan', 27.47, 89.64), C('Dhaka', 'Bangladesh', 23.81, 90.41),
  C('Colombo', 'Sri Lanka', 6.93, 79.86), C('Male', 'Maldives', 4.18, 73.51), C('Naypyidaw', 'Myanmar', 19.76, 96.08), C('Bangkok', 'Thailand', 13.76, 100.5),
  C('Hanoi', 'Vietnam', 21.03, 105.85), C('Phnom Penh', 'Cambodia', 11.56, 104.92), C('Kuala Lumpur', 'Malaysia', 3.14, 101.69), C('Singapore', 'Singapore', 1.35, 103.82),
  C('Jakarta', 'Indonesia', -6.21, 106.85), C('Manila', 'Philippines', 14.6, 120.98), C('Beijing', 'China', 39.9, 116.41), C('Tokyo', 'Japan', 35.68, 139.69),
  C('Seoul', 'South Korea', 37.57, 126.98), C('Pyongyang', 'North Korea', 39.04, 125.76), C('Ulaanbaatar', 'Mongolia', 47.89, 106.91), C('Astana', 'Kazakhstan', 51.17, 71.45),
  C('Tashkent', 'Uzbekistan', 41.3, 69.24), C('Canberra', 'Australia', -35.28, 149.13), C('Wellington', 'New Zealand', -41.29, 174.78), C('Suva', 'Fiji', -18.14, 178.44),
  C('Ottawa', 'Canada', 45.42, -75.7), C('Mexico City', 'Mexico', 19.43, -99.13), C('Havana', 'Cuba', 23.11, -82.37), C('Kingston', 'Jamaica', 18.02, -76.8),
  C('Panama City', 'Panama', 8.98, -79.52), C('Bogota', 'Colombia', 4.71, -74.07), C('Caracas', 'Venezuela', 10.48, -66.9), C('Quito', 'Ecuador', -0.18, -78.47),
  C('Lima', 'Peru', -12.05, -77.04), C('La Paz', 'Bolivia', -16.5, -68.15), C('Santiago', 'Chile', -33.45, -70.67), C('Buenos Aires', 'Argentina', -34.6, -58.38),
  C('Montevideo', 'Uruguay', -34.9, -56.16), C('Brasilia', 'Brazil', -15.79, -47.88), C('Rabat', 'Morocco', 34.02, -6.84), C('Algiers', 'Algeria', 36.75, 3.06),
  C('Tunis', 'Tunisia', 36.81, 10.18), C('Tripoli', 'Libya', 32.89, 13.19), C('Khartoum', 'Sudan', 15.5, 32.56), C('Addis Ababa', 'Ethiopia', 9.03, 38.74),
  C('Nairobi', 'Kenya', -1.29, 36.82), C('Kampala', 'Uganda', 0.35, 32.58), C('Kigali', 'Rwanda', -1.95, 30.06), C('Dodoma', 'Tanzania', -6.16, 35.75),
  C('Lusaka', 'Zambia', -15.39, 28.32), C('Harare', 'Zimbabwe', -17.83, 31.05), C('Pretoria', 'South Africa', -25.75, 28.19), C('Windhoek', 'Namibia', -22.56, 17.07),
  C('Luanda', 'Angola', -8.84, 13.23), C('Kinshasa', 'DR Congo', -4.44, 15.27), C('Abuja', 'Nigeria', 9.08, 7.4), C('Accra', 'Ghana', 5.6, -0.19),
  C('Dakar', 'Senegal', 14.72, -17.47), C('Antananarivo', 'Madagascar', -18.88, 47.51), C('Port Louis', 'Mauritius', -20.16, 57.5), C('Victoria', 'Seychelles', -4.62, 55.45),
]

const T = (n: string, of: string, lat: number, lon: number): Place => ({ kind: 'city', n, of, lat, lon })
export const CITIES: Place[] = [
  T('Tel Aviv', 'Israel', 32.09, 34.78),
  // India
  T('Mumbai', 'India', 19.08, 72.88), T('Kolkata', 'India', 22.57, 88.36), T('Chennai', 'India', 13.08, 80.27), T('Bengaluru', 'India', 12.97, 77.59),
  T('Hyderabad', 'India', 17.39, 78.49), T('Ahmedabad', 'India', 23.02, 72.57), T('Pune', 'India', 18.52, 73.86), T('Jaipur', 'India', 26.91, 75.79),
  T('Lucknow', 'India', 26.85, 80.95), T('Chandigarh', 'India', 30.73, 76.78), T('Amritsar', 'India', 31.63, 74.87), T('Varanasi', 'India', 25.32, 82.97),
  T('Agra', 'India', 27.18, 78.01), T('Srinagar', 'India', 34.08, 74.8), T('Leh', 'India', 34.15, 77.58), T('Shimla', 'India', 31.1, 77.17),
  T('Guwahati', 'India', 26.14, 91.74), T('Shillong', 'India', 25.58, 91.89), T('Bhubaneswar', 'India', 20.3, 85.82), T('Patna', 'India', 25.59, 85.14),
  T('Bhopal', 'India', 23.26, 77.41), T('Indore', 'India', 22.72, 75.86), T('Nagpur', 'India', 21.15, 79.09), T('Kochi', 'India', 9.93, 76.27),
  T('Thiruvananthapuram', 'India', 8.52, 76.94), T('Madurai', 'India', 9.93, 78.12), T('Mysuru', 'India', 12.3, 76.64), T('Panaji', 'India', 15.5, 73.83),
  T('Udaipur', 'India', 24.59, 73.71), T('Jaisalmer', 'India', 26.92, 70.91), T('Visakhapatnam', 'India', 17.69, 83.22), T('Port Blair', 'India', 11.62, 92.73),
  T('Rishikesh', 'India', 30.09, 78.27), T('Darjeeling', 'India', 27.04, 88.26), T('Puducherry', 'India', 11.94, 79.81), T('Surat', 'India', 21.17, 72.83),
  // The world
  T('New York', 'United States', 40.71, -74.01), T('Los Angeles', 'United States', 34.05, -118.24), T('San Francisco', 'United States', 37.77, -122.42),
  T('Chicago', 'United States', 41.88, -87.63), T('Las Vegas', 'United States', 36.17, -115.14), T('Miami', 'United States', 25.76, -80.19),
  T('Seattle', 'United States', 47.61, -122.33), T('Houston', 'United States', 29.76, -95.37), T('Toronto', 'Canada', 43.65, -79.38), T('Vancouver', 'Canada', 49.28, -123.12),
  T('Rio de Janeiro', 'Brazil', -22.91, -43.17), T('Sao Paulo', 'Brazil', -23.55, -46.63), T('Cancun', 'Mexico', 21.16, -86.85),
  T('Dubai', 'United Arab Emirates', 25.2, 55.27), T('Istanbul', 'Turkey', 41.01, 28.98), T('Mecca', 'Saudi Arabia', 21.39, 39.86),
  T('Barcelona', 'Spain', 41.39, 2.17), T('Venice', 'Italy', 45.44, 12.32), T('Milan', 'Italy', 45.46, 9.19), T('Florence', 'Italy', 43.77, 11.26),
  T('Munich', 'Germany', 48.14, 11.58), T('Zurich', 'Switzerland', 47.38, 8.54), T('Geneva', 'Switzerland', 46.2, 6.14), T('Manchester', 'United Kingdom', 53.48, -2.24),
  T('Edinburgh', 'United Kingdom', 55.95, -3.19), T('St Petersburg', 'Russia', 59.93, 30.36), T('Nice', 'France', 43.7, 7.27), T('Santorini', 'Greece', 36.39, 25.46),
  T('Shanghai', 'China', 31.23, 121.47), T('Hong Kong', 'China', 22.32, 114.17), T('Osaka', 'Japan', 34.69, 135.5), T('Kyoto', 'Japan', 35.01, 135.77),
  T('Bali', 'Indonesia', -8.34, 115.09), T('Phuket', 'Thailand', 7.88, 98.39), T('Ho Chi Minh City', 'Vietnam', 10.82, 106.63), T('Lahore', 'Pakistan', 31.55, 74.34),
  T('Karachi', 'Pakistan', 24.86, 67.0), T('Sydney', 'Australia', -33.87, 151.21), T('Melbourne', 'Australia', -37.81, 144.96), T('Perth', 'Australia', -31.95, 115.86),
  T('Auckland', 'New Zealand', -36.85, 174.76), T('Cape Town', 'South Africa', -33.92, 18.42), T('Johannesburg', 'South Africa', -26.2, 28.05),
  T('Lagos', 'Nigeria', 6.52, 3.38), T('Marrakesh', 'Morocco', 31.63, -7.98), T('Zanzibar', 'Tanzania', -6.16, 39.2), T('Honolulu', 'United States', 21.31, -157.86),
]
