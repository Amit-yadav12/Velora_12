// Server-side synthetic ecosystem — mirrors src/lib/synthetic.ts so API
// fallbacks stay consistent with the client. Deterministic per city+id.

export const SYN_BASE = 100000;
export const SYN_CITY_STRIDE = 20000;
export const SYN_CAT_STRIDE = 400;
export const PER_CAT_PER_CITY = 7;

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CITIES = [
  { name: 'Hyderabad', slug: 'hyderabad', lat: 17.385, lng: 78.4867, areas: ['Banjara Hills', 'Jubilee Hills', 'Hitech City', 'Gachibowli', 'Madhapur', 'Kukatpally', 'Dilsukhnagar', 'Secunderabad', 'Begumpet', 'Kothapet', 'LB Nagar', 'Uppal'] },
  { name: 'Bengaluru', slug: 'bengaluru', lat: 12.9716, lng: 77.5946, areas: ['Koramangala', 'Indiranagar', 'Whitefield', 'HSR Layout', 'Jayanagar', 'MG Road', 'Hebbal', 'Yelahanka', 'Electronic City', 'Malleshwaram', 'BTM Layout', 'Marathahalli'] },
  { name: 'Mumbai', slug: 'mumbai', lat: 19.076, lng: 72.8777, areas: ['Andheri West', 'Bandra West', 'Juhu', 'Powai', 'Thane West', 'Borivali', 'Colaba', 'Dadar', 'Malad', 'Goregaon', 'Kurla', 'Vashi'] },
  { name: 'Delhi', slug: 'delhi', lat: 28.6139, lng: 77.209, areas: ['Connaught Place', 'Karol Bagh', 'Rohini', 'Dwarka', 'Saket', 'Lajpat Nagar', 'Pitampura', 'Laxmi Nagar', 'Chandni Chowk', 'Vasant Kunj', 'Noida Sector 18', 'Gurgaon Sector 29'] },
  { name: 'Chennai', slug: 'chennai', lat: 13.0827, lng: 80.2707, areas: ['T Nagar', 'Anna Nagar', 'Velachery', 'Adyar', 'Porur', 'Guindy', 'Tambaram', 'Nungambakkam', 'Mylapore', 'OMR Perungudi', 'Sholinganallur', 'Kilpauk'] },
  { name: 'Pune', slug: 'pune', lat: 18.5204, lng: 73.8567, areas: ['Koregaon Park', 'Hinjewadi', 'Viman Nagar', 'Kothrud', 'Baner', 'Wakad', 'Hadapsar', 'Camp', 'Pimpri', 'Kharadi', 'Wanowrie', 'Aundh'] },
  { name: 'Jaipur', slug: 'jaipur', lat: 26.9124, lng: 75.7873, areas: ['Malviya Nagar', 'C Scheme', 'Vaishali Nagar', 'Mansarovar', 'MI Road', 'Tonk Road', 'Jagatpura', 'Pratap Nagar', 'Raja Park', 'Civil Lines', 'Bapu Nagar', 'Sanganer'] },
  { name: 'Kolkata', slug: 'kolkata', lat: 22.5726, lng: 88.3639, areas: ['Salt Lake Sector V', 'Park Street', 'New Town', 'Ballygunge', 'Dum Dum', 'Behala', 'Jadavpur', 'Esplanade', 'Howrah', 'Gariahat', 'Lake Town', 'Rajarhat'] },
  { name: 'Ahmedabad', slug: 'ahmedabad', lat: 23.0225, lng: 72.5714, areas: ['SG Highway', 'Satellite', 'Maninagar', 'Bopal', 'Navrangpura', 'Vastrapur', 'Gota', 'Nikol', 'Paldi', 'Ashram Road', 'Thaltej', 'Naranpura'] },
  { name: 'Lucknow', slug: 'lucknow', lat: 26.8467, lng: 80.9462, areas: ['Gomti Nagar', 'Hazratganj', 'Aliganj', 'Indira Nagar', 'Alambagh', 'Jankipuram', 'Vikas Nagar', 'Aminabad', 'Chowk', 'Faizabad Road', 'Sushant Golf City', 'Vrindavan Yojna'] },
  { name: 'Chandigarh', slug: 'chandigarh', lat: 30.7333, lng: 76.7794, areas: ['Sector 17', 'Sector 35', 'Sector 44', 'Sector 22', 'Sector 34', 'Sector 15', 'Sector 43', 'Manimajra', 'Sector 21', 'Industrial Area', 'Sector 8', 'Zirakpur Road'] },
  { name: 'Indore', slug: 'indore', lat: 22.7196, lng: 75.8577, areas: ['Vijay Nagar', 'Palasia', 'MG Road', 'AB Road', 'Bengali Square', 'LIG Square', 'Khajrana', 'Sudama Nagar', 'Tilak Nagar', 'Sarafa', 'Rajwada', 'Rau'] },
  { name: 'Varanasi', slug: 'varanasi', lat: 25.3176, lng: 82.9739, areas: ['Sigra', 'Lanka', 'Chetganj', 'Bhelupur', 'Assi', 'Godowlia', 'Cantonment', 'Shivpur', 'Sarnath', 'Mahmoorganj', 'Rath Yatra', 'Pandeypur'] },
  { name: 'Surat', slug: 'surat', lat: 21.1702, lng: 72.8311, areas: ['Adajan', 'Vesu', 'Piplod', 'Athwa', 'Katargam', 'Varachha', 'Pal', 'City Light', 'Nanpura', 'Udhna', 'Pandeshwar', 'Althan'] },
  { name: 'Nagpur', slug: 'nagpur', lat: 21.1458, lng: 79.0882, areas: ['Sitabuldi', 'Dharampeth', 'Civil Lines', 'Hingna Road', 'Manish Nagar', 'Pratap Nagar', 'Nandanvan', 'Lakadganj', 'Sadar', 'Wardhaman Nagar', 'Beltarodi', 'MIHAN'] },
  { name: 'Kochi', slug: 'kochi', lat: 9.9312, lng: 76.2673, areas: ['Marine Drive', 'Kakkanad', 'Edappally', 'Fort Kochi', 'Kadavanthra', 'Vyttila', 'Palarivattom', 'Aluva', 'Thrippunithura', 'Kalamassery', 'Panampilly Nagar', 'Willingdon Island'] },
];

export function cityIndex(name) {
  const i = CITIES.findIndex((c) => c.name.toLowerCase() === String(name || '').toLowerCase() || c.slug === String(name || '').toLowerCase());
  return i >= 0 ? i : 6; // default Jaipur
}

export function getCity(name) {
  const k = String(name || '').toLowerCase();
  return CITIES.find((c) => c.name.toLowerCase() === k || c.slug === k) || null;
}

// Compact category defs: [name, open, close, img, brands[], suffixes[], roles[], services[[n,d,dur,lo,hi]]]
const C = (name, open, close, img, brands, suffixes, roles, services) => ({ name, open, close, img, brands, suffixes, roles, services });

export const CATS = [
  C('Clinics', '09:00', '21:00', '/biz/clinic.jpg', ['Aarogya', 'CityCare', 'LifeLine', 'Sanjeevani', 'MediTrust', 'HealthFirst', 'CarePoint', 'Vitalis'], ['Clinic', 'Health Clinic', 'Family Clinic', 'Multi-Speciality Clinic', 'Care Centre'], ['General Physician', 'Paediatrician', 'Physician', 'Nurse'], [['General Consultation', 'Complete checkup with physician', 20, 300, 800], ['Follow-up Visit', 'Review within 7 days', 15, 200, 400], ['Health Checkup Basic', 'Vitals + blood sugar + BP', 30, 499, 999], ['Vaccination', 'All standard vaccines', 15, 250, 2500], ['ECG Test', '12-lead ECG with report', 15, 300, 600]]),
  C('Hospitals', '00:00', '23:59', '/biz/hospital.jpg', ['ApolloCare', 'FortisCare', 'MaxCare', 'NarayanaCare', 'ManipalCare', 'CityCare Hospitals'], ['Hospitals', 'Multispeciality Hospital', 'Super Speciality Hospital', 'General Hospital'], ['Cardiologist', 'Orthopaedic Surgeon', 'Neurologist', 'Duty Doctor'], [['OPD Consultation', 'Specialist doctor visit', 20, 500, 1500], ['Full Body Checkup', '60+ tests with doctor review', 120, 1999, 5999], ['X-Ray', 'Digital X-ray with report', 20, 400, 900], ['Ultrasound', 'Whole abdomen scan', 30, 900, 2200], ['Emergency Care', '24x7 casualty', 60, 1000, 5000]]),
  C('Dentists', '10:00', '20:00', '/biz/dental.jpg', ['SmileCraft', 'PearlDent', 'ToothFairy', 'DentaCare', 'BrightSmile', 'OrthoSmile'], ['Dental Clinic', 'Dental Studio', 'Dental Care', 'Smile Studio'], ['Dentist', 'Orthodontist', 'Dental Hygienist'], [['Dental Checkup', 'Exam + treatment plan', 20, 300, 500], ['Cleaning & Polishing', 'Scaling + stain removal', 45, 800, 2500], ['Root Canal (RCT)', 'Single sitting painless RCT', 60, 4000, 9000], ['Braces Consultation', 'Metal / ceramic / aligners', 30, 500, 1000], ['Teeth Whitening', 'Laser whitening session', 60, 6000, 15000]]),
  C('Diagnostic Centers', '07:00', '21:00', '/biz/clinic.jpg', ['Thyro Labs', 'Lal Labs', 'Metropolis Labs', 'Lucid Labs', 'Vijaya Labs'], ['Diagnostics', 'Pathology Labs', 'Diagnostic Centre'], ['Phlebotomist', 'Lab Technician', 'Pathologist'], [['Blood Test Panel', 'CBC + sugar + lipid', 15, 399, 1299], ['Thyroid Profile', 'T3 T4 TSH complete', 15, 450, 950], ['Full Body Package', '75+ tests + free consult', 30, 1499, 3999], ['Home Sample Collection', 'Doorstep pickup', 20, 0, 150]]),
  C('Pharmacies', '08:00', '23:00', '/biz/clinic.jpg', ['MedPlus', 'Apollo Med', 'Wellness', 'Care Med'], ['Pharmacy', 'Medical Store', 'Health Pharmacy'], ['Pharmacist', 'Store Manager'], [['Prescription Order', 'Upload & get medicines', 10, 99, 999], ['BP Check', 'Free BP monitoring', 5, 0, 50], ['Sugar Check', 'Glucometer test', 5, 30, 80]]),
  C('Salons', '10:00', '21:00', '/biz/salon.jpg', ['Lakme', 'Naturals', 'Envi', 'Bounce', 'YLG', 'Looks', 'Geetanjali'], ['Salon', 'Hair & Beauty', 'Luxury Salon', 'Unisex Salon'], ['Senior Stylist', 'Hair Spa Expert', 'Beautician', 'Makeup Artist'], [['Haircut + Styling', 'Cut, wash & blow-dry', 45, 299, 1499], ['Hair Spa', 'Deep nourish ritual', 60, 999, 2999], ['Global Hair Colour', 'Ammonia-free colour', 120, 2999, 7999], ['Facial Glow', 'Signature brightening facial', 60, 1499, 4999], ['Manicure + Pedicure', 'Spa mani-pedi combo', 75, 999, 2499]]),
  C('Barbershops', '09:00', '22:00', '/biz/barber.jpg', ['Gatsby', 'ManeStreet', 'Blade & Co', 'CutCrew', 'SharpEdge', 'UrbanBlade'], ['Barbershop', 'Mens Grooming', 'Hair & Beard Studio'], ['Master Barber', 'Beard Stylist'], [['Haircut', 'Classic / fade / textured', 30, 199, 799], ['Beard Trim + Shape', 'Precision beard styling', 20, 149, 499], ['Haircut + Beard Combo', 'Full grooming session', 50, 349, 1099], ['Head Massage', 'Champi stress relief', 20, 199, 499]]),
  C('Spas', '10:00', '21:00', '/biz/spa.jpg', ['O2 Spa', 'Tattva Spa', 'Anahata', 'SereneSoul', 'AyurBliss', 'Zenith'], ['Spa', 'Wellness Spa', 'Thai Spa', 'Day Spa'], ['Spa Therapist', 'Masseur', 'Wellness Consultant'], [['Full Body Massage (60m)', 'Swedish / deep tissue', 60, 1999, 4499], ['Balinese Massage', 'Aromatherapy ritual', 75, 2499, 5499], ['Head Shoulder Back', 'Express 30-min relief', 30, 999, 1999], ['Couples Spa', 'Private suite for two', 90, 4999, 9999]]),
  C('Beauty Clinics', '10:00', '20:00', '/biz/salon.jpg', ['Kaya', 'VLCC', 'DermaGlow', 'SkinQ', 'GlowLab', 'Aesthetica'], ['Skin Clinic', 'Aesthetic Centre', 'Derma Clinic'], ['Dermatologist', 'Aesthetician', 'Laser Specialist'], [['Skin Consultation', 'Analysis + treatment plan', 30, 500, 1000], ['HydraFacial', 'Deep cleanse + glow', 60, 2500, 6000], ['Laser Hair Reduction', 'Full body sessions', 60, 4999, 24999], ['Chemical Peel', 'Pigmentation & acne', 45, 2000, 5500]]),
  C('Gyms', '05:00', '23:00', '/biz/gym.jpg', ['Cultfit', 'IronParadise', 'FlexNation', 'PowerHouse', 'MuscleMantra', 'FitArena'], ['Fitness', 'Gym', 'Strength Club'], ['Head Coach', 'Strength Trainer', 'Nutritionist'], [['Day Pass', 'Full-day gym access', 120, 200, 500], ['Monthly Membership', 'All equipment + classes', 30, 1500, 4000], ['Personal Training (12)', '1-on-1 transformation', 60, 8000, 25000], ['Zumba Group Class', 'Dance fitness', 60, 300, 600]]),
  C('Fitness Centers', '05:30', '22:30', '/biz/gym.jpg', ['FitZone', 'ActiveLife', 'ToneUp', 'CoreCulture', 'PeakFit', 'BurnBox'], ['Fitness Centre', 'Wellness Club', 'Fit Studio'], ['Fitness Coach', 'CrossFit Trainer', 'Dietician'], [['Functional Training', 'HIIT + mobility batch', 60, 500, 1200], ['Weight Loss Program', '90-day guided plan', 60, 6000, 18000], ['Strength Assessment', 'Baseline + roadmap', 45, 499, 999]]),
  C('Yoga Studios', '05:00', '21:00', '/biz/gym.jpg', ['YogaMantra', 'Pranayama', 'Asana House', 'OmShala', 'Yogalaya', 'Sattva'], ['Yoga Studio', 'Yoga Shala', 'Yoga & Meditation'], ['Yoga Acharya', 'Meditation Guide'], [['Drop-in Class', 'Hatha / Vinyasa flow', 60, 250, 500], ['Monthly Batch', '12 sessions + diet chart', 60, 1800, 3500], ['Meditation Session', 'Guided mindfulness', 45, 300, 700], ['Therapy Yoga', 'Back pain / PCOS care', 60, 800, 1500]]),
  C('Physiotherapy Centers', '08:00', '21:00', '/biz/physio.jpg', ['PhysioActive', 'ProHealth', 'MoveWell', 'RehabRight', 'Kineticure'], ['Physiotherapy', 'Physio & Rehab', 'Pain Clinic'], ['Physiotherapist', 'Sports Physio'], [['Physio Assessment', 'Movement + pain mapping', 30, 400, 800], ['Pain Relief Session', 'IFT / ultrasound therapy', 45, 500, 1000], ['Back Pain Program', '6-session spine care', 45, 3000, 7000], ['Home Physio Visit', 'At-home therapy', 60, 800, 1500]]),
  C('Wellness Centers', '07:00', '21:00', '/biz/spa.jpg', ['VedaWell', 'Prakruti', 'OjasWell', 'Tattvam', 'Swasthya'], ['Wellness Centre', 'Ayurveda Retreat', 'Holistic Clinic'], ['Ayurvedic Doctor', 'Naturopath'], [['Ayurvedic Consultation', 'Dosha analysis + plan', 45, 600, 1200], ['Abhyanga Massage', '4-hand oil therapy', 60, 1800, 3500], ['Shirodhara', 'Stress & sleep therapy', 60, 2200, 4500]]),
  C('Restaurants', '11:00', '23:00', '/biz/indianhotel.jpg', ['SpiceSymphony', 'Tandoori Nights', 'Dakshin Feast', 'Royal Dine', 'Biryani House'], ['Restaurant', 'Fine Dine', 'Family Restaurant', 'Multi-Cuisine'], ['Head Chef', 'Captain'], [['Table for 2', 'Window / regular seating', 90, 0, 0], ['Buffet Lunch', 'Unlimited multi-cuisine', 120, 549, 1299], ['Buffet Dinner', 'Live grill + desserts', 150, 749, 1699], ['Private Dining', 'Celebration room', 180, 2000, 5000]]),
  C('Cafés', '09:00', '23:00', '/biz/indianhotel.jpg', ['Cafe Aaranya', 'BrewRoom', 'Filter Kaapi House', 'Mocha Tales', 'BeanBarn'], ['Café', 'Coffee House', 'Espresso Bar'], ['Barista', 'Pastry Chef'], [['Table Booking', 'Indoor / outdoor seat', 120, 0, 0], ['Brewing Workshop', 'Pour-over masterclass', 90, 999, 1999], ['High Tea for 2', 'Snacks + beverages', 120, 799, 1499]]),
  C('Hotels', '00:00', '23:59', '/biz/hotel.jpg', ['Grand Residency', 'City Suites', 'Royal Stay', 'Business Inn', 'Lakeview Hotel'], ['Hotel', 'Grand Hotel', 'Residency', 'Suites & Spa'], ['Front Office Manager', 'Concierge'], [['Deluxe Room / Night', 'Queen bed + breakfast', 1440, 2499, 7999], ['Executive Suite / Night', 'Lounge + suite perks', 1440, 5999, 15999], ['Day-Use Room (8h)', 'Work + rest package', 480, 1499, 3999], ['Banquet Hall', 'Events up to 200 guests', 300, 25000, 90000]]),
  C('Coworking Spaces', '08:00', '22:00', '/biz/coaching.jpg', ['WorkNest', 'HustleHub', 'DeskDweller', 'Startup Bay', 'Focus Labs'], ['Coworking', 'Workspaces', 'Business Centre'], ['Community Manager', 'Facility Lead'], [['Day Pass', 'Hot desk + wifi + coffee', 600, 399, 899], ['Hot Desk Monthly', 'Flexible seating', 30, 4999, 9999], ['Meeting Room / Hour', '6-seater + screen', 60, 500, 1200]]),
  C('Sports Centers', '06:00', '22:00', '/biz/sports.jpg', ['Athlive', 'GameOn Arena', 'Sportiq', 'PlayZone', 'AceArena'], ['Sports Arena', 'Sports Club', 'Multi-Sport Centre'], ['Head Coach', 'Facility Manager'], [['Court Booking / Hour', 'Badminton / TT / box cricket', 60, 300, 900], ['Monthly Membership', 'Open play all sports', 30, 2000, 5000], ['Kids Coaching', 'Weekend batches', 60, 1500, 3500]]),
  C('Cricket Turfs', '06:00', '23:00', '/biz/sports.jpg', ['TurfTown', 'CricArena', 'SixerPark', 'WicketWorld', 'PowerPlay Turf'], ['Cricket Turf', 'Box Cricket', 'Turf Arena'], ['Turf Manager', 'Coach'], [['Turf Slot / Hour', '6-a-side with equipment', 60, 1200, 3500], ['Night Slot / Hour', 'Floodlit premium hours', 60, 1800, 4500], ['Tournament (Team)', 'Weekend cup', 240, 3000, 8000]]),
  C('Football Grounds', '06:00', '22:00', '/biz/sports.jpg', ['GoalArena', 'KickOff', 'StrikerPark', 'GoalLine', 'HatTrick'], ['Football Ground', 'Soccer Turf', 'Football Arena'], ['Ground Manager', 'Football Coach'], [['Ground Slot / Hour', '5-a-side / 7-a-side', 60, 1500, 4000], ['Kids Academy Trial', 'Age 5-15 batches', 60, 300, 600], ['Monthly Academy', '12 coached sessions', 60, 2500, 5000]]),
  C('Badminton Courts', '05:00', '23:00', '/biz/badminton.jpg', ['ShuttleZone', 'SmashArena', 'CourtCraft', 'RallyHouse', 'NetPlay'], ['Badminton Academy', 'Shuttle Courts', 'Badminton Club'], ['Badminton Coach', 'Court Manager'], [['Court / Hour', 'Singles / doubles', 60, 250, 700], ['Coaching Monthly', 'Beginner to advanced', 60, 2000, 4500], ['Racket Stringing', 'Same-day service', 30, 250, 500]]),
  C('Swimming Pools', '06:00', '21:00', '/biz/sports.jpg', ['AquaSplash', 'BlueWave', 'SwimFit', 'CrystalPool', 'SplashPoint'], ['Swimming Pool', 'Swim Academy', 'Aquatic Centre'], ['Swim Coach', 'Lifeguard'], [['Open Swim / Hour', 'Lap + leisure lanes', 60, 200, 500], ['Learn to Swim (12)', 'Beginner batch', 60, 3000, 7000], ['Aqua Aerobics', 'Low-impact fitness', 45, 400, 800]]),
  C('Coaching Institutes', '07:00', '21:00', '/biz/coaching.jpg', ['CareerPath', 'Excel Academy', 'RankUp', 'Topper Academy', 'BrightPath'], ['Coaching Institute', 'Academy', 'Classes'], ['Physics Faculty', 'Maths Faculty', 'Counsellor'], [['Demo Class', 'Free trial session', 90, 0, 0], ['JEE / NEET Batch', 'Class 11-12 + dropper', 120, 60000, 180000], ['Foundation (8-10)', 'Olympiad + boards', 90, 25000, 70000], ['Test Series', 'All-India mock tests', 180, 4999, 14999]]),
  C('Tutors', '07:00', '21:00', '/biz/education.jpg', ['LearnLead', 'GradeUp Tutors', 'ScholarSprint', 'TopperTribe', 'StudySathi'], ['Home Tuitions', 'Tuition Centre', 'Study Centre'], ['Maths Tutor', 'Science Tutor'], [['Trial Class', 'Free 1-hour session', 60, 0, 0], ['Monthly Tuition (1-5)', 'All subjects', 60, 2000, 5000], ['Monthly Tuition (6-10)', 'Maths + Science focus', 90, 3000, 8000]]),
  C('Driving Schools', '07:00', '20:00', '/biz/car.jpg', ['SafeDrive', 'WheelGuru', 'DriveMate', 'RoadReady', 'PerfectGear'], ['Driving School', 'Motor Training', 'Driving Academy'], ['Driving Instructor', 'RTO Coordinator'], [['Car Training (10 days)', 'Manual + auto basics', 60, 4500, 9000], ['Car Training (20 days)', 'Zero to confident', 60, 7500, 14000], ['Licence Assistance', 'LL + DL + RTO slot', 30, 1500, 3500]]),
  C('Passport Offices', '09:00', '17:00', '/biz/law.jpg', ['Passport Seva Kendra', 'Visa & Passport Hub', 'TravelDocs Desk'], ['PSK Centre', 'Passport Assistance'], ['Documentation Expert', 'Coordinator'], [['New Passport Filing', 'Form + appointment', 45, 1000, 2500], ['Renewal Filing', 'Reissue assistance', 45, 1000, 2200], ['Tatkaal Guidance', 'Fast-track support', 45, 1500, 3000]]),
  C('Government Services', '09:00', '18:00', '/biz/law.jpg', ['SevaSetu', 'eSeva Point', 'JanSeva Kendra', 'CitizenDesk'], ['Seva Kendra', 'Citizen Services', 'e-Seva Centre'], ['Service Executive', 'Documentation Officer'], [['Aadhaar Update', 'Mobile / address / biometric', 30, 100, 300], ['PAN Application', 'New / correction / reprint', 30, 250, 500], ['Affidavit & Notary', 'Draft + notarization', 30, 300, 1000]]),
  C('Banks', '10:00', '16:00', '/biz/law.jpg', ['City Bank Branch', 'Metro Bank', 'National Bank Branch'], ['Branch', 'Bank & Locker Desk'], ['Branch Manager', 'Relationship Manager'], [['Account Opening', 'Savings / current / salary', 30, 0, 0], ['Loan Consultation', 'Home / personal / auto', 45, 0, 0], ['Locker Visit', 'Safe deposit access', 15, 0, 0]]),
  C('Insurance Offices', '10:00', '18:00', '/biz/law.jpg', ['PolicyDesk', 'CoverSure', 'InsureFirst', 'SafeGuard Advisors'], ['Insurance', 'Insurance Advisors'], ['Insurance Advisor', 'Claims Specialist'], [['Health Insurance Plan', 'Family floater quotes', 45, 0, 0], ['Motor Insurance', 'Car / bike renewal', 20, 0, 0], ['Claim Filing Help', 'Cashless + reimbursement', 30, 0, 0]]),
  C('Lawyers', '10:00', '19:00', '/biz/law.jpg', ['LexVeritas', 'Nyaya Associates', 'VakilDesk', 'CaseCraft', 'Dharma Legal'], ['Law Chambers', 'Advocates', 'Legal Associates'], ['Senior Advocate', 'Associate Lawyer'], [['Legal Consultation', '30-min expert advice', 30, 1000, 5000], ['Property Registration', 'Draft + registration', 120, 5000, 25000], ['Startup Incorporation', 'Pvt Ltd + compliance', 60, 8000, 25000]]),
  C('Professional Services', '10:00', '19:00', '/biz/law.jpg', ['SharpTax', 'AccuBooks', 'ComplyKart', 'FinEdge', 'TaxMitra'], ['CA & Consultants', 'Tax Consultants', 'Audit Firm'], ['Chartered Accountant', 'Tax Consultant'], [['ITR Filing', 'Salaried / business', 45, 999, 4999], ['GST Registration', 'New GSTIN + setup', 60, 1999, 5999], ['Monthly Bookkeeping', 'Ledgers + GST returns', 60, 3000, 12000]]),
  C('Consultants', '10:00', '19:00', '/biz/coaching.jpg', ['CareerCraft', 'VisaVerse', 'PathFinders', 'MentorMap'], ['Consultancy', 'Career Consultants', 'Visa Consultants'], ['Senior Counsellor', 'Visa Expert'], [['Career Counselling', 'Aptitude + roadmap', 60, 1500, 4000], ['Study Abroad Plan', 'Shortlist + SOP + visa', 60, 0, 0], ['Resume Makeover', 'ATS + LinkedIn revamp', 60, 1500, 5000]]),
  C('Pet Clinics', '09:00', '21:00', '/biz/clinic.jpg', ['Paws & Claws', 'HappyTails', 'VetCare Plus', 'FurryFriends', 'Pawfect Care'], ['Pet Clinic', 'Veterinary Clinic', 'Pet Care Centre'], ['Veterinarian', 'Vet Assistant'], [['Vet Consultation', 'General health check', 20, 400, 800], ['Vaccination', 'ARV / DHPPi / FVRCP', 15, 400, 1800], ['Pet Grooming', 'Bath + cut + nails', 90, 800, 2500]]),
  C('Veterinary Hospitals', '00:00', '23:59', '/biz/hospital.jpg', ['VetSuperCare', 'AnimalAid Hospital', 'VetLife Hospital', 'HealPaws'], ['Veterinary Hospital', 'Animal Hospital', 'Pet Emergency'], ['Veterinary Surgeon', 'Emergency Vet'], [['Emergency Care', '24x7 casualty', 60, 1000, 5000], ['Pet Surgery', 'Spay / neuter / ortho', 120, 5000, 30000], ['Health Package', 'Senior pet screening', 45, 1999, 4999]]),
  C('Car Rentals', '00:00', '23:59', '/biz/car.jpg', ['DriveEasy', 'RentRide', 'CityCruise', 'GoDrive'], ['Car Rentals', 'Self-Drive Cars', 'Chauffeur Cars'], ['Fleet Manager', 'Support Executive'], [['Hatchback / Day', 'Swift / Baleno self-drive', 1440, 1800, 2800], ['SUV / Day', 'Creta / XUV self-drive', 1440, 3500, 6500], ['Chauffeur 8h/80km', 'Sedan with driver', 480, 2500, 4500], ['Airport Drop', 'One-way transfer', 120, 900, 2200]]),
  C('Bike Rentals', '08:00', '22:00', '/biz/car.jpg', ['BikeBlitz', 'ThrottleRent', 'RoadRider Rentals', 'RideReady'], ['Bike Rentals', 'Motorcycle Rentals', 'Scooter Rentals'], ['Fleet Executive', 'Mechanic'], [['Scooter / Day', 'Activa / Ntorq', 1440, 500, 900], ['Royal Enfield / Day', 'Classic 350', 1440, 1500, 2500], ['Sport Bike / Day', 'KTM / R15 / Apache', 1440, 1800, 3500]]),
  C('Car Service Centers', '09:00', '20:00', '/biz/car.jpg', ['CarClinic', 'AutoMend', 'MotorWorks', 'FixMyCar', 'ServiceLane'], ['Car Service', 'Auto Garage', 'Car Care Studio'], ['Service Advisor', 'Master Technician'], [['General Service', 'Oil + filters + checkup', 240, 2499, 7999], ['Car Detailing', 'Interior + exterior spa', 300, 1999, 8999], ['AC Repair & Gas', 'Cooling + leak check', 120, 1499, 4999], ['Wheel Alignment', 'Balancing + rotation', 60, 800, 2000]]),
  C('EV Charging Stations', '00:00', '23:59', '/biz/car.jpg', ['VoltHub', 'ChargeKart', 'PlugPoint', 'GreenWatt'], ['EV Charging', 'Charge Station', 'Fast Charging Hub'], ['Station Attendant', 'Support Engineer'], [['DC Fast Charge', '20-80% in ~45 min', 60, 400, 1200], ['AC Slow Charge', 'Mall parking charge', 240, 200, 600], ['Slot Reservation', 'Guaranteed charger slot', 15, 50, 150]]),
  C('Home Services', '08:00', '21:00', '/biz/education.jpg', ['GharSeva', 'HomeMate', 'FixKar', 'Doorstep Pro'], ['Home Services', 'Doorstep Services', 'Home Care'], ['Service Professional', 'Support Executive'], [['Home Deep Cleaning', '2-3 BHK full clean', 240, 2499, 6999], ['AC Service', 'Foam + gas check', 90, 499, 1499], ['Appliance Repair', 'Fridge / WM / TV', 60, 349, 1500], ['Pest Control', 'Cockroach + mosquito', 90, 999, 2999]]),
  C('Electricians', '08:00', '22:00', '/biz/education.jpg', ['VoltFix', 'BijliMistri', 'WireWizard', 'SparkSquad'], ['Electrical Services', 'Electrician on Call'], ['Electrician', 'Senior Electrician'], [['Home Visit + Repair', 'Switches / fans / MCB', 60, 199, 799], ['Fan Installation', 'Ceiling / wall / exhaust', 45, 249, 499], ['Inverter Setup', 'Install + battery', 90, 500, 1500]]),
  C('Plumbers', '08:00', '22:00', '/biz/education.jpg', ['PipeDoctor', 'NalKarigar', 'FlowFix', 'AquaPlumb'], ['Plumbing Services', 'Plumber on Call'], ['Plumber', 'Senior Plumber'], [['Home Visit + Repair', 'Taps / leaks / flush', 60, 199, 799], ['Bathroom Fittings', 'Shower / mixer / WC', 90, 499, 2500], ['Blockage Removal', 'Kitchen / drain lines', 60, 499, 1500]]),
  C('Cleaners', '08:00', '21:00', '/biz/education.jpg', ['SparkleHome', 'DustBusters', 'CleanSweep Pro', 'NeatNest'], ['Cleaning Services', 'Deep Cleaning Co'], ['Cleaning Lead', 'Cleaning Executive'], [['1BHK Deep Clean', 'Kitchen + bath + floors', 180, 1499, 2999], ['3BHK Deep Clean', 'Full home detailing', 300, 2999, 6999], ['Sofa + Carpet Shampoo', '5-seater + rugs', 120, 999, 2499]]),
  C('Event Venues', '09:00', '22:00', '/biz/hotel.jpg', ['GrandCelebrations', 'VenueVault', 'PartyPalace', 'BanquetBliss'], ['Banquets', 'Convention Centre', 'Party Lawns'], ['Venue Manager', 'Event Planner'], [['Banquet (100 guests)', '4-hour slot + basics', 240, 40000, 120000], ['Lawn (300 guests)', 'Evening wedding slot', 300, 90000, 250000], ['Conference Hall', 'Corporate day package', 480, 25000, 80000]]),
  C('Photography Studios', '09:00', '21:00', '/biz/coaching.jpg', ['PixelPerfect', 'CandidTales', 'ShutterSoul', 'FrameCraft'], ['Photography', 'Photo Studio', 'Candid Studio'], ['Lead Photographer', 'Cinematographer'], [['Portrait Session', '1-hour studio shoot', 60, 2500, 8000], ['Pre-wedding Shoot', '2 locations + teaser', 480, 25000, 80000], ['Wedding Day', 'Photo + video team', 600, 60000, 200000]]),
  C('Travel Agencies', '10:00', '20:00', '/biz/hotel.jpg', ['WanderLust Trips', 'YatraMitra', 'GlobeTrek', 'SafarSathi'], ['Travels', 'Holidays', 'Tours & Travels'], ['Travel Consultant', 'Visa Expert'], [['Flight Booking', 'Best-fare promise', 30, 0, 0], ['Holiday Package (3N)', 'Goa / Kerala / Dubai', 60, 15000, 90000], ['Visa Filing', 'Schengen / US / UK', 45, 2000, 8000]]),
];

export function isSyntheticId(id) {
  const n = Number(id);
  return Number.isFinite(n) && n >= SYN_BASE;
}

export function decodeId(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n < SYN_BASE) return null;
  const off = n - SYN_BASE;
  const cityIdx = Math.floor(off / SYN_CITY_STRIDE);
  const rem = off % SYN_CITY_STRIDE;
  const catIdx = Math.floor(rem / SYN_CAT_STRIDE);
  const idx = rem % SYN_CAT_STRIDE;
  if (cityIdx < 0 || cityIdx >= CITIES.length || catIdx < 0 || catIdx >= CATS.length) return null;
  return { cityIdx, catIdx, idx: idx % PER_CAT_PER_CITY };
}

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Sai', 'Rohan', 'Kabir', 'Ananya', 'Diya', 'Myra', 'Sara', 'Priya', 'Neha', 'Kavya', 'Rahul', 'Amit', 'Suresh', 'Priyanka', 'Deepak', 'Sneha', 'Kiran', 'Manish', 'Pooja', 'Vikram'];
const LAST = ['Sharma', 'Verma', 'Reddy', 'Iyer', 'Nair', 'Gupta', 'Mehta', 'Khan', 'Das', 'Kulkarni', 'Patel', 'Singh', 'Yadav', 'Rao', 'Menon', 'Agarwal', 'Jain', 'Mishra', 'Ghosh', 'Pillai', 'Shetty', 'Rathore', 'Pawar', 'Joshi'];
const STREETS = ['Main Road', '1st Cross', '2nd Main', '100 Feet Road', '80 Feet Road', 'Ring Road', 'Station Road', 'Market Road', 'Temple Street', 'High Street'];
const LANDMARKS = ['Near Metro Station', 'Opp. City Mall', 'Beside HDFC Bank', 'Near Bus Depot', 'Opp. Grand Hotel', 'Near Flyover', 'Next to Apollo Pharmacy', 'Near Petrol Pump'];
const OFFERS = [
  { title: 'First-visit special', desc: 'Flat 20% OFF your first booking', code: 'WELCOME20' },
  { title: 'Weekday saver', desc: 'Extra 15% OFF Mon-Thu slots', code: 'WEEKDAY15' },
  { title: 'Early-bird deal', desc: '10% OFF morning slots before 11 AM', code: 'EARLY10' },
  { title: 'Family pack', desc: 'Book for 3+, get 25% OFF total', code: 'FAMILY25' },
  { title: 'Festive offer', desc: 'Flat Rs.200 OFF above Rs.999', code: 'FESTIVE200' },
];

function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
function round5(n) { if (n <= 0) return 0; return Math.round(n / 50) * 50 || 50; }

function bizName(rnd, def, area, idx) {
  const style = rnd();
  if (style < 0.45) return `${pick(rnd, def.brands)} ${pick(rnd, def.suffixes)}`;
  if (style < 0.8) return `${area} ${pick(rnd, def.suffixes)}`;
  const cores = ['Prime', 'Elite', 'Royal', 'Grand', 'Supreme', 'Classic', 'Premium', 'Star', 'Shree', 'Sri', 'Om'];
  const nm = `${pick(rnd, cores)} ${pick(rnd, def.brands)}`;
  return idx > 3 ? `${nm} ${area.split(' ')[0]}` : nm;
}

function phoneFor(rnd) {
  const prefixes = ['98', '99', '90', '91', '93', '94', '95', '96', '97', '80', '81', '70', '72', '79'];
  let n = pick(rnd, prefixes);
  for (let i = 0; i < 8; i++) n += Math.floor(rnd() * 10).toString();
  return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
}

const cityCache = new Map();

export function cityBusinesses(cityName, opts = {}) {
  const ci = cityIndex(cityName);
  const city = CITIES[ci];
  const cacheKey = city.slug;
  let all = cityCache.get(cacheKey);
  if (!all) {
    all = [];
    for (let catIdx = 0; catIdx < CATS.length; catIdx++) {
      const def = CATS[catIdx];
      for (let idx = 0; idx < PER_CAT_PER_CITY; idx++) {
        const id = SYN_BASE + ci * SYN_CITY_STRIDE + catIdx * SYN_CAT_STRIDE + idx;
        const rnd = mulberry32(hashStr(`${city.slug}|${def.name}|${idx}`));
        const area = city.areas[Math.floor(rnd() * city.areas.length)];
        const name = bizName(rnd, def, area, idx);
        const rating = Math.round((3.9 + rnd() * 1.1) * 10) / 10;
        const reviewCount = 40 + Math.floor(rnd() * 2400);
        const seed = `velora-${id}`;
        all.push({
          id, synthetic: true, active: true, name, category: def.name,
          description: `${name} in ${area}, ${city.name} — rated ${rating} by ${reviewCount}+ customers with instant Velora booking.`,
          address: `${1 + Math.floor(rnd() * 120)}, ${pick(rnd, STREETS)}, ${area}, ${city.name}`,
          city: city.name, area, landmark: pick(rnd, LANDMARKS),
          lat: Math.round((city.lat + (rnd() - 0.5) * 0.18) * 100000) / 100000,
          lng: Math.round((city.lng + (rnd() - 0.5) * 0.18) * 100000) / 100000,
          phone: phoneFor(rnd), rating, review_count: reviewCount,
          image_url: `https://picsum.photos/seed/${seed}/640/420`,
          cover_url: `https://picsum.photos/seed/${seed}-cover/1200/500`,
          featured: rnd() > 0.9, open_time: def.open, close_time: def.close,
          offers: [OFFERS[Math.floor(rnd() * OFFERS.length)]],
          wait_min: 5 + Math.floor(rnd() * 30),
          ai_popularity: 55 + Math.floor(rnd() * 45),
        });
      }
    }
    all.sort((a, b) => Number(b.featured || false) - Number(a.featured || false) || b.ai_popularity - a.ai_popularity);
    cityCache.set(cacheKey, all);
  }
  let out = all;
  if (opts.category && opts.category !== 'All') {
    const want = String(opts.category).toLowerCase();
    out = out.filter((b) => String(b.category).toLowerCase() === want);
  }
  if (opts.limit) out = out.slice(0, opts.limit);
  return out;
}

export function syntheticBusiness(id) {
  const dec = decodeId(id);
  if (!dec) return null;
  const city = CITIES[dec.cityIdx];
  const def = CATS[dec.catIdx];
  if (!city || !def) return null;
  const list = cityBusinesses(city.name);
  const found = list.find((b) => b.id === Number(id));
  if (!found) return null;
  const rnd = mulberry32(hashStr(`details|${id}`));
  const services = def.services.map((t, si) => ({
    id: Number(id) * 100 + si, business_id: Number(id),
    name: t[0], description: t[1], duration_min: t[2],
    price: t[3] === 0 && t[4] === 0 ? 0 : round5(t[3] + rnd() * (t[4] - t[3])),
    active: true,
  }));
  const staffCount = 2 + Math.floor(rnd() * 3);
  const staff = [];
  for (let i = 0; i < staffCount; i++) {
    staff.push({
      id: Number(id) * 1000 + i, business_id: Number(id),
      name: `${pick(rnd, FIRST)} ${pick(rnd, LAST)}`,
      role: def.roles[i % def.roles.length], active: true,
    });
  }
  return { ...found, services, staff };
}

export function syntheticSlots(bizId, dateStr, durationMin, openTime, closeTime) {
  const rnd = mulberry32(hashStr(`slots|${bizId}|${dateStr}`));
  const openH = parseInt((openTime || '09:00').split(':')[0], 10);
  const closeH = openTime === '00:00' ? 24 : (parseInt((closeTime || '21:00').split(':')[0], 10) || 21);
  const now = Date.now();
  const day = new Date(`${dateStr}T00:00:00`);
  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
  const loadFactor = isWeekend ? 0.42 : 0.26;
  const slots = [];
  for (let h = openH; h < closeH; h++) {
    for (const m of [0, 30]) {
      const s = new Date(`${dateStr}T00:00:00`);
      s.setHours(h, m, 0, 0);
      if (s.getTime() < now - 60000) continue;
      const peak = (h >= 11 && h <= 13) || (h >= 17 && h <= 19);
      const taken = rnd() < loadFactor + (peak ? 0.18 : 0);
      const crowd = taken ? 2 + Math.floor(rnd() * 3) : peak ? Math.floor(rnd() * 3) : Math.floor(rnd() * 2);
      const status = taken ? 'booked' : crowd >= 2 ? 'busy' : 'available';
      const wait = taken ? null : Math.min(35, crowd * 8 + (peak ? 6 : 0));
      let score = 0;
      if (!taken) {
        score = 100 - (wait || 0) - crowd * 10;
        if (h >= 10 && h <= 11) score += 8;
        if (h >= 15 && h <= 16) score += 6;
        if (h >= 12 && h <= 13) score -= 6;
      }
      slots.push({
        time: s.toISOString(),
        label: s.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
        status, available: !taken, wait_min: wait, crowd, score: Math.round(score),
      });
    }
  }
  return slots;
}

export function syntheticHeatmap(bizId) {
  const rnd = mulberry32(hashStr(`heat|${bizId}`));
  const bias = rnd() * 0.3;
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const wd = d.getDay();
    const weekend = wd === 0 || wd === 6;
    const occ = Math.min(0.96, Math.max(0.08, (weekend ? 0.55 : 0.3) + bias + (rnd() - 0.5) * 0.3 + (i === 0 ? 0.12 : 0)));
    days.push({
      date: d.toISOString().slice(0, 10),
      weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      day: d.getDate(), occupancy: Math.round(occ * 100),
    });
  }
  const hours = [];
  for (let h = 9; h <= 20; h++) {
    const peak = (h >= 11 && h <= 13) || (h >= 17 && h <= 19);
    hours.push({ hour: `${h}:00`, occupancy: Math.round(Math.min(96, (peak ? 62 : 30) + rnd() * 25)) });
  }
  const best = [...days].filter((d) => d.occupancy < 55).sort((a, b) => a.occupancy - b.occupancy).slice(0, 3);
  const busiest = [...days].sort((a, b) => b.occupancy - a.occupancy)[0];
  return { days, hours, best_days: best.length ? best : days.slice(0, 3), busiest_day: busiest };
}
