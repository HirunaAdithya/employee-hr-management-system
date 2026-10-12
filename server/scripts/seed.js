import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, Department } from '../src/models.js';

const departments = [
  ['Tour Operations', 'Inbound tours, itineraries and tour coordination'],
  ['Reservations & Ticketing', 'Bookings, accommodation and flight ticketing'],
  ['Guest Relations', 'Airport welcome, customer care and concierge'],
  ['Transport & Guides', 'Tour guides, drivers and fleet coordination'],
  ['Sales & Marketing', 'Travel agents, partnerships and promotions'],
  ['Finance & Administration', 'Accounts, payroll, HR and administration']
];

try {
  const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!MONGODB_URI || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.startsWith('replace_') || Buffer.byteLength(ADMIN_PASSWORD, 'utf8') < 12 || Buffer.byteLength(ADMIN_PASSWORD, 'utf8') > 72) {
    throw Error('Set MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL and a unique 12–72 byte ADMIN_PASSWORD in server/.env');
  }
  await mongoose.connect(MONGODB_URI);
  for (const [name, description] of departments) await Department.updateOne({ name }, { $setOnInsert: { name, description } }, { upsert: true });
  const email = ADMIN_EMAIL.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (!existing) {
    await User.create({ name: ADMIN_NAME.trim(), email, passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12), role: 'admin' });
    console.log(`Created admin account: ${email}`);
  } else console.log(`Admin user ${email} already exists; password was NOT changed.`);
  console.log('Rayana departments are ready. No employee data was seeded.');
} catch (error) { console.error('Seed failed:', error.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
