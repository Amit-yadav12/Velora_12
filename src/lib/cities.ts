// Velora city registry — the selected city is the active context across the
// entire platform. Every page filters to this city until the user changes it.

export interface City {
  name: string;
  slug: string;
  state: string;
  lat: number;
  lng: number;
  tagline: string;
  areas: string[];
}

export const CITIES: City[] = [
  {
    name: 'Hyderabad', slug: 'hyderabad', state: 'Telangana', lat: 17.385, lng: 78.4867,
    tagline: 'City of Pearls',
    areas: ['Banjara Hills', 'Jubilee Hills', 'Hitech City', 'Gachibowli', 'Madhapur', 'Kukatpally', 'Dilsukhnagar', 'Secunderabad', 'Begumpet', 'Kothapet', 'LB Nagar', 'Uppal'],
  },
  {
    name: 'Bengaluru', slug: 'bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946,
    tagline: 'Silicon Valley of India',
    areas: ['Koramangala', 'Indiranagar', 'Whitefield', 'HSR Layout', 'Jayanagar', 'MG Road', 'Hebbal', 'Yelahanka', 'Electronic City', 'Malleshwaram', 'BTM Layout', 'Marathahalli'],
  },
  {
    name: 'Mumbai', slug: 'mumbai', state: 'Maharashtra', lat: 19.076, lng: 72.8777,
    tagline: 'City of Dreams',
    areas: ['Andheri West', 'Bandra West', 'Juhu', 'Powai', 'Thane West', 'Borivali', 'Colaba', 'Dadar', 'Malad', 'Goregaon', 'Kurla', 'Vashi'],
  },
  {
    name: 'Delhi', slug: 'delhi', state: 'Delhi NCR', lat: 28.6139, lng: 77.209,
    tagline: 'Capital City',
    areas: ['Connaught Place', 'Karol Bagh', 'Rohini', 'Dwarka', 'Saket', 'Lajpat Nagar', 'Pitampura', 'Laxmi Nagar', 'Chandni Chowk', 'Vasant Kunj', 'Noida Sector 18', 'Gurgaon Sector 29'],
  },
  {
    name: 'Chennai', slug: 'chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707,
    tagline: 'Gateway to South India',
    areas: ['T Nagar', 'Anna Nagar', 'Velachery', 'Adyar', 'Porur', 'Guindy', 'Tambaram', 'Nungambakkam', 'Mylapore', 'OMR Perungudi', 'Sholinganallur', 'Kilpauk'],
  },
  {
    name: 'Pune', slug: 'pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567,
    tagline: 'Oxford of the East',
    areas: ['Koregaon Park', 'Hinjewadi', 'Viman Nagar', 'Kothrud', 'Baner', 'Wakad', 'Hadapsar', 'Camp', 'Pimpri', 'Kharadi', 'Wanowrie', 'Aundh'],
  },
  {
    name: 'Jaipur', slug: 'jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873,
    tagline: 'Pink City',
    areas: ['Malviya Nagar', 'C Scheme', 'Vaishali Nagar', 'Mansarovar', 'MI Road', 'Tonk Road', 'Jagatpura', 'Pratap Nagar', 'Raja Park', 'Civil Lines', 'Bapu Nagar', 'Sanganer'],
  },
  {
    name: 'Kolkata', slug: 'kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639,
    tagline: 'City of Joy',
    areas: ['Salt Lake Sector V', 'Park Street', 'New Town', 'Ballygunge', 'Dum Dum', 'Behala', 'Jadavpur', 'Esplanade', 'Howrah', 'Gariahat', 'Lake Town', 'Rajarhat'],
  },
  {
    name: 'Ahmedabad', slug: 'ahmedabad', state: 'Gujarat', lat: 23.0225, lng: 72.5714,
    tagline: 'Manchester of India',
    areas: ['SG Highway', 'Satellite', 'Maninagar', 'Bopal', 'Navrangpura', 'Vastrapur', 'Gota', 'Nikol', 'Paldi', 'Ashram Road', 'Thaltej', 'Naranpura'],
  },
  {
    name: 'Lucknow', slug: 'lucknow', state: 'Uttar Pradesh', lat: 26.8467, lng: 80.9462,
    tagline: 'City of Nawabs',
    areas: ['Gomti Nagar', 'Hazratganj', 'Aliganj', 'Indira Nagar', 'Alambagh', 'Jankipuram', 'Vikas Nagar', 'Aminabad', 'Chowk', 'Faizabad Road', 'Sushant Golf City', 'Vrindavan Yojna'],
  },
  {
    name: 'Chandigarh', slug: 'chandigarh', state: 'Chandigarh', lat: 30.7333, lng: 76.7794,
    tagline: 'City Beautiful',
    areas: ['Sector 17', 'Sector 35', 'Sector 44', 'Sector 22', 'Sector 34', 'Sector 15', 'Sector 43', 'Manimajra', 'Sector 21', 'Industrial Area', 'Sector 8', 'Zirakpur Road'],
  },
  {
    name: 'Indore', slug: 'indore', state: 'Madhya Pradesh', lat: 22.7196, lng: 75.8577,
    tagline: 'Cleanest City of India',
    areas: ['Vijay Nagar', 'Palasia', 'MG Road', 'AB Road', 'Bengali Square', 'LIG Square', 'Khajrana', 'Sudama Nagar', 'Tilak Nagar', 'Sarafa', 'Rajwada', 'Rau'],
  },
  {
    name: 'Varanasi', slug: 'varanasi', state: 'Uttar Pradesh', lat: 25.3176, lng: 82.9739,
    tagline: 'Spiritual Capital',
    areas: ['Sigra', 'Lanka', 'Chetganj', 'Bhelupur', 'Assi', 'Godowlia', 'Cantonment', 'Shivpur', 'Sarnath', 'Mahmoorganj', 'Rath Yatra', 'Pandeypur'],
  },
  {
    name: 'Surat', slug: 'surat', state: 'Gujarat', lat: 21.1702, lng: 72.8311,
    tagline: 'Diamond City',
    areas: ['Adajan', 'Vesu', 'Piplod', 'Athwa', 'Katargam', 'Varachha', 'Pal', 'City Light', 'Nanpura', 'Udhna', 'Pandeshwar', 'Althan'],
  },
  {
    name: 'Nagpur', slug: 'nagpur', state: 'Maharashtra', lat: 21.1458, lng: 79.0882,
    tagline: 'Orange City',
    areas: ['Sitabuldi', 'Dharampeth', 'Civil Lines', 'Hingna Road', 'Manish Nagar', 'Pratap Nagar', 'Nandanvan', 'Lakadganj', 'Sadar', 'Wardhaman Nagar', 'Beltarodi', 'MIHAN'],
  },
  {
    name: 'Kochi', slug: 'kochi', state: 'Kerala', lat: 9.9312, lng: 76.2673,
    tagline: 'Queen of the Arabian Sea',
    areas: ['Marine Drive', 'Kakkanad', 'Edappally', 'Fort Kochi', 'Kadavanthra', 'Vyttila', 'Palarivattom', 'Aluva', 'Thrippunithura', 'Kalamassery', 'Panampilly Nagar', 'Willingdon Island'],
  },
];

export const CITY_NAMES = CITIES.map((c) => c.name);

const byName = new Map(CITIES.map((c) => [c.name.toLowerCase(), c]));
const bySlug = new Map(CITIES.map((c) => [c.slug, c]));

export function getCity(nameOrSlug: string | null | undefined): City | null {
  if (!nameOrSlug) return null;
  const k = String(nameOrSlug).trim().toLowerCase();
  return byName.get(k) || bySlug.get(k) || null;
}

export function cityIndex(name: string): number {
  const i = CITIES.findIndex((c) => c.name.toLowerCase() === String(name || '').toLowerCase());
  return i >= 0 ? i : 0;
}

/** Default city when nothing is selected yet (matches legacy default center). */
export const DEFAULT_CITY_NAME = 'Jaipur';

/** Resolve a free-form location label to a known city (for legacy labels). */
export function cityFromLabel(label: string | null | undefined): City {
  const hit = getCity((label || '').split(',')[0]);
  if (hit) return hit;
  // Try substring match ("Current location", coords, etc. fall through to default)
  const low = String(label || '').toLowerCase();
  for (const c of CITIES) {
    if (low.includes(c.name.toLowerCase())) return c;
  }
  return getCity(DEFAULT_CITY_NAME)!;
}
