import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, Department, Employee, Attendance, Leave, Payroll, Audit } from './models.js';

const app = express();
const PORT = Number(process.env.PORT || 5001);
const SECRET = process.env.JWT_SECRET || '';
const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const isoMonth = /^\d{4}-(0[1-9]|1[0-2])$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const roleStaff = ['admin', 'hr'];
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const error = (status, message) => Object.assign(new Error(message), { status });
const text = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const validId = value => mongoose.isValidObjectId(value);
const money = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000000 && Math.abs(Math.round(value * 100) - value * 100) < 0.000001;
const localDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const localHour = (date = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date).replace(':', ''));
const pagination = req => ({ limit: Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 100)) });
const audit = async (req, action, detail = '') => {
  try { await Audit.create({ actor: req.user.id, action, detail: text(detail, 240) }); }
  catch (e) { console.error('Audit write failed:', e.message); }
};

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '48kb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 1000, standardHeaders: 'draft-7', legacyHeaders: false }));
app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'Rayana Travels HRMS' }));

const auth = wrap(async (req, _res, next) => {
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!bearer) throw error(401, 'Please log in');
  let payload;
  try { payload = jwt.verify(bearer, SECRET, { algorithms: ['HS256'] }); }
  catch { throw error(401, 'Session expired; please log in again'); }
  const user = await User.findById(payload.sub).lean();
  if (!user?.active) throw error(401, 'Account unavailable');
  if (user.employee && !await Employee.exists({ _id: user.employee, status: { $ne: 'Inactive' } })) throw error(403, 'Employee account is inactive');
  req.user = { id: String(user._id), role: user.role, name: user.name, email: user.email, employee: user.employee ? String(user.employee) : null };
  next();
});
const staff = (req, _res, next) => roleStaff.includes(req.user.role) ? next() : next(error(403, 'HR permissions required'));
const admin = (req, _res, next) => req.user.role === 'admin' ? next() : next(error(403, 'Administrator permission required'));
const ensureEmployee = req => { if (!req.user.employee) throw error(400, 'No employee profile is linked to this account'); return req.user.employee; };

app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false }), wrap(async (req, res) => {
  const email = text(req.body?.email, 160).toLowerCase();
  const password = req.body?.password;
  if (!emailPattern.test(email) || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72) throw error(400, 'Invalid login details');
  const user = await User.findOne({ email, active: true }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw error(401, 'Incorrect email or password');
  if (user.employee && !await Employee.exists({ _id: user.employee, status: { $ne: 'Inactive' } })) throw error(403, 'Employee account is inactive');
  const token = jwt.sign({ sub: String(user._id) }, SECRET, { expiresIn: '8h', algorithm: 'HS256' });
  res.json({ token, user: { id: String(user._id), name: user.name, email: user.email, role: user.role, employee: user.employee } });
}));
app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));

app.get('/api/departments', auth, wrap(async (_req, res) => res.json({ departments: await Department.find().sort({ name: 1 }).lean() })));
app.post('/api/departments', auth, staff, wrap(async (req, res) => {
  const name = text(req.body?.name, 100), description = text(req.body?.description, 300);
  if (name.length < 3) throw error(400, 'Enter a department name (at least 3 characters)');
  const department = await Department.create({ name, description });
  await audit(req, 'department.create', name);
  res.status(201).json({ department });
}));

const employeeFields = ['name', 'email', 'phone', 'department', 'designation', 'joiningDate', 'employmentType', 'status', 'baseSalary', 'languages', 'guideLicense', 'emergencyContact', 'address'];
function validateEmployee(input, partial = false) {
  const result = {};
  for (const key of employeeFields) {
    if (!(key in input)) continue;
    const val = input[key];
    result[key] = key === 'baseSalary' ? Number(val) : ['name', 'email', 'phone', 'designation', 'joiningDate', 'languages', 'guideLicense', 'emergencyContact', 'address'].includes(key) ? text(val, key === 'address' ? 250 : 200) : val;
  }
  if (!partial && ['name','email','department','designation','joiningDate'].some(key => !result[key])) throw error(400, 'Name, email, department, role and joining date are required');
  if ('name' in result && result.name.length < 2) throw error(400, 'Enter a valid employee name');
  if ('email' in result) { result.email = result.email.toLowerCase(); if (!emailPattern.test(result.email)) throw error(400, 'Invalid email address'); }
  if ('department' in result && !validId(result.department)) throw error(400, 'Invalid department');
  if ('joiningDate' in result && (!isoDay.test(result.joiningDate) || Number.isNaN(Date.parse(result.joiningDate)))) throw error(400, 'Invalid joining date');
  if ('baseSalary' in result && !money(result.baseSalary)) throw error(400, 'Base salary must be a nonnegative LKR amount with at most 2 decimals');
  if ('employmentType' in result && !['Full-time','Part-time','Contract','Intern'].includes(result.employmentType)) throw error(400, 'Invalid employment type');
  if ('status' in result && !['Active','On Leave','Inactive'].includes(result.status)) throw error(400, 'Invalid status');
  if ('designation' in result && result.designation.length < 2) throw error(400, 'Invalid designation');
  return result;
}
const employeePublicFields = 'employeeNo name email phone department designation joiningDate employmentType status languages guideLicense';
app.get('/api/employees', auth, wrap(async (req, res) => {
  if (!roleStaff.includes(req.user.role)) {
    const record = req.user.employee ? await Employee.findById(req.user.employee).select(employeePublicFields).populate('department', 'name').lean() : null;
    return res.json({ employees: record ? [record] : [] });
  }
  const q = text(req.query.q, 70);
  const filter = q ? { $or: [{ name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { employeeNo: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }] } : {};
  const employees = await Employee.find(filter).sort({ createdAt: -1 }).limit(500).populate('department', 'name').lean();
  res.json({ employees });
}));
app.post('/api/employees', auth, staff, wrap(async (req, res) => {
  const fields = validateEmployee(req.body || {});
  const employeeNo = text(req.body?.employeeNo, 24).toUpperCase();
  if (!/^RAY-[A-Z0-9-]{3,18}$/.test(employeeNo)) throw error(400, 'Employee ID must be RAY- followed by 3–18 letters/numbers');
  if (!await Department.exists({ _id: fields.department })) throw error(400, 'Department not found');
  const employee = await Employee.create({ ...fields, employeeNo });
  await audit(req, 'employee.create', employee.employeeNo);
  res.status(201).json({ employee });
}));
app.patch('/api/employees/:id', auth, staff, wrap(async (req, res) => {
  if (!validId(req.params.id)) throw error(400, 'Invalid employee ID');
  const fields = validateEmployee(req.body || {}, true);
  if (!Object.keys(fields).length) throw error(400, 'No valid fields to update');
  if (fields.email && await User.exists({ employee: req.params.id, email: { $ne: fields.email } })) throw error(409, 'This employee has a login. Email changes must be handled by an administrator.');
  if (fields.department && !await Department.exists({ _id: fields.department })) throw error(400, 'Department not found');
  const employee = await Employee.findByIdAndUpdate(req.params.id, { $set: fields }, { new: true, runValidators: true });
  if (!employee) throw error(404, 'Employee not found');
  await audit(req, 'employee.update', employee.employeeNo);
  res.json({ employee });
}));
app.post('/api/employees/:id/account', auth, admin, wrap(async (req, res) => {
  if (!validId(req.params.id)) throw error(400, 'Invalid employee');
  const employee = await Employee.findById(req.params.id);
  if (!employee) throw error(404, 'Employee not found');
  if (await User.exists({ employee: employee.id })) throw error(409, 'Employee login already exists');
  const password = req.body?.password;
  const role = req.body?.role || 'employee';
  if (!['hr','employee'].includes(role) || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') < 12 || Buffer.byteLength(password, 'utf8') > 72) throw error(400, 'Choose HR or Employee and a 12–72 byte password');
  if (await User.exists({ email: employee.email })) throw error(409, 'This email already has a user account');
  const account = await User.create({ name: employee.name, email: employee.email, role, employee: employee.id, passwordHash: await bcrypt.hash(password, 12) });
  await audit(req, 'account.create', `${employee.employeeNo} · ${role}`);
  res.status(201).json({ account: { id: account.id, email: account.email, role } });
}));

app.get('/api/attendance', auth, wrap(async (req, res) => {
  const month = text(req.query.month, 7);
  if (month && !isoMonth.test(month)) throw error(400, 'Invalid month');
  const query = {};
  if (month) query.day = { $regex: `^${month}` };
  if (!roleStaff.includes(req.user.role)) query.employee = ensureEmployee(req);
  const attendance = await Attendance.find(query).sort({ day: -1, checkIn: -1 }).limit(pagination(req).limit).populate('employee', 'employeeNo name designation').lean();
  res.json({ attendance });
}));
app.post('/api/attendance/check-in', auth, wrap(async (req, res) => {
  const employee = ensureEmployee(req);
  const now = new Date();
  const day = localDay(now);
  if (!await Employee.exists({ _id: employee, status: 'Active' })) throw error(400, 'Active employee profile required');
  let record;
  try { record = await Attendance.create({ employee, day, checkIn: now, status: localHour(now) > 915 ? 'Late' : 'Present' }); }
  catch (e) { if (e.code === 11000) throw error(409, 'Already checked in today'); throw e; }
  res.status(201).json({ attendance: record });
}));
app.post('/api/attendance/check-out', auth, wrap(async (req, res) => {
  const employee = ensureEmployee(req);
  const record = await Attendance.findOneAndUpdate({ employee, day: localDay(), checkOut: null }, { $set: { checkOut: new Date() } }, { new: true });
  if (!record) throw error(409, 'Check in first, or you have already checked out');
  res.json({ attendance: record });
}));
app.post('/api/attendance/manual', auth, staff, wrap(async (req, res) => {
  const { employee, day, checkIn, checkOut } = req.body || {};
  const localTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  if (!validId(employee) || !isoDay.test(day || '') || Number.isNaN(Date.parse(day)) || !localTimePattern.test(checkIn || '') || (checkOut && !localTimePattern.test(checkOut))) throw error(400, 'Invalid attendance details');
  // datetime-local carries no zone. Treat HR input as Sri Lanka local time.
  const start = new Date(`${checkIn}:00+05:30`);
  const end = checkOut ? new Date(`${checkOut}:00+05:30`) : null;
  if (Number.isNaN(start.getTime()) || (end && (Number.isNaN(end.getTime()) || end < start)) || localDay(start) !== day) throw error(400, 'Check-in must belong to the selected Sri Lanka date');
  if (!await Employee.exists({ _id: employee })) throw error(404, 'Employee not found');
  const record = await Attendance.create({ employee, day, checkIn: start, checkOut: end, source: 'HR entry', status: localHour(start) > 915 ? 'Late' : 'Present' });
  await audit(req, 'attendance.manual', `${employee} · ${day}`);
  res.status(201).json({ attendance: record });
}));

app.get('/api/leaves', auth, wrap(async (req, res) => {
  const query = roleStaff.includes(req.user.role) ? {} : { employee: ensureEmployee(req) };
  const leaves = await Leave.find(query).sort({ createdAt: -1 }).limit(pagination(req).limit).populate('employee', 'employeeNo name designation department').populate('reviewedBy', 'name').lean();
  res.json({ leaves });
}));
app.post('/api/leaves', auth, wrap(async (req, res) => {
  const employee = roleStaff.includes(req.user.role) && req.body?.employee ? req.body.employee : ensureEmployee(req);
  const { type, from, to } = req.body || {};
  const reason = text(req.body?.reason, 500);
  if (!validId(employee) || !['Annual','Casual','Sick','Unpaid','Other'].includes(type) || !isoDay.test(from || '') || !isoDay.test(to || '') || !reason) throw error(400, 'Complete all leave request fields');
  const fromMs = Date.parse(`${from}T00:00:00Z`), toMs = Date.parse(`${to}T00:00:00Z`);
  const days = Math.round((toMs - fromMs) / 86400000) + 1;
  if (!Number.isFinite(days) || days < 1 || days > 90) throw error(400, 'Leave date range must be 1–90 calendar days');
  if (!await Employee.exists({ _id: employee })) throw error(404, 'Employee not found');
  const leave = await Leave.create({ employee, type, from, to, days, reason });
  await audit(req, 'leave.request', `${type} · ${days} days`);
  res.status(201).json({ leave });
}));
app.patch('/api/leaves/:id/review', auth, staff, wrap(async (req, res) => {
  if (!validId(req.params.id) || !['Approved','Rejected'].includes(req.body?.status)) throw error(400, 'Invalid review');
  const existing = await Leave.findById(req.params.id);
  if (!existing) throw error(404, 'Leave not found');
  if (req.user.employee && String(existing.employee) === req.user.employee) throw error(403, 'You cannot approve your own leave');
  const leave = await Leave.findOneAndUpdate({ _id: req.params.id, status: 'Pending' }, { $set: { status: req.body.status, reviewNote: text(req.body.note, 300), reviewedBy: req.user.id, reviewedAt: new Date() } }, { new: true });
  if (!leave) throw error(409, 'Leave request already reviewed');
  await audit(req, 'leave.review', `${leave.status} · ${leave.id}`);
  res.json({ leave });
}));

app.get('/api/payroll', auth, wrap(async (req, res) => {
  const month = text(req.query.month, 7);
  if (month && !isoMonth.test(month)) throw error(400, 'Invalid month');
  const query = {};
  if (month) query.month = month;
  if (!roleStaff.includes(req.user.role)) query.employee = ensureEmployee(req);
  const payroll = await Payroll.find(query).sort({ month: -1, createdAt: -1 }).limit(pagination(req).limit).populate('employee', 'employeeNo name designation department').lean();
  res.json({ payroll });
}));
app.post('/api/payroll', auth, staff, wrap(async (req, res) => {
  const { employee, month } = req.body || {};
  const base = Number(req.body?.base), allowances = Number(req.body?.allowances ?? 0), deductions = Number(req.body?.deductions ?? 0);
  if (!validId(employee) || !isoMonth.test(month || '') || !money(base) || !money(allowances) || !money(deductions) || deductions > base + allowances) throw error(400, 'Invalid payroll amounts or month');
  if (!await Employee.exists({ _id: employee })) throw error(404, 'Employee not found');
  const net = Math.round((base + allowances - deductions) * 100) / 100;
  const payroll = await Payroll.create({ employee, month, base, allowances, deductions, net, notes: text(req.body.notes, 300), createdBy: req.user.id });
  await audit(req, 'payroll.create', `${employee} · ${month}`);
  res.status(201).json({ payroll });
}));
app.patch('/api/payroll/:id/pay', auth, admin, wrap(async (req, res) => {
  if (!validId(req.params.id)) throw error(400, 'Invalid payroll ID');
  const payroll = await Payroll.findOneAndUpdate({ _id: req.params.id, status: 'Draft' }, { $set: { status: 'Paid', paidAt: new Date() } }, { new: true });
  if (!payroll) throw error(409, 'Payroll not found or already marked paid');
  await audit(req, 'payroll.mark-paid', `${payroll.month} · ${payroll.id}`);
  res.json({ payroll });
}));

app.get('/api/overview', auth, wrap(async (req, res) => {
  const day = localDay();
  if (!roleStaff.includes(req.user.role)) {
    const employee = ensureEmployee(req);
    const [attendance, pending, leaves, payroll] = await Promise.all([
      Attendance.findOne({ employee, day }).lean(),
      Leave.countDocuments({ employee, status: 'Pending' }),
      Leave.find({ employee }).sort({ createdAt: -1 }).limit(4).lean(),
      Payroll.find({ employee }).sort({ month: -1 }).limit(4).lean()
    ]);
    return res.json({ overview: { day, attendance, pendingLeaves: pending, recentLeaves: leaves, recentPayroll: payroll } });
  }
  const [headcount, active, departments, present, pendingLeaves, leaveRequests, upcoming, payrollStats, activity] = await Promise.all([
    Employee.countDocuments(), Employee.countDocuments({ status: 'Active' }), Department.countDocuments(), Attendance.countDocuments({ day }),
    Leave.countDocuments({ status: 'Pending' }), Leave.find().sort({ createdAt: -1 }).limit(5).populate('employee', 'name employeeNo').lean(),
    Employee.find({ status: 'Active' }).sort({ joiningDate: -1 }).limit(5).select('name employeeNo designation joiningDate').lean(),
    Payroll.aggregate([{ $match: { month: day.slice(0, 7) } }, { $group: { _id: null, gross: { $sum: '$net' }, paid: { $sum: { $cond: [{ $eq: ['$status','Paid'] }, '$net', 0] } }, count: { $sum: 1 } } }]),
    Audit.find().sort({ createdAt: -1 }).limit(6).populate('actor', 'name').lean()
  ]);
  res.json({ overview: { day, headcount, active, departments, present, pendingLeaves, leaveRequests, upcoming, payroll: payrollStats[0] || { gross: 0, paid: 0, count: 0 }, activity } });
}));
app.get('/api/audit', auth, admin, wrap(async (_req, res) => res.json({ activity: await Audit.find().sort({ createdAt: -1 }).limit(150).populate('actor', 'name role').lean() })));

app.use((err, _req, res, _next) => {
  if (err.code === 11000) return res.status(409).json({ message: `Duplicate value: ${Object.keys(err.keyPattern || {}).join(', ')}` });
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ message: 'Invalid data. Check your form entries.' });
  if (err.status) return res.status(err.status).json({ message: err.message });
  console.error('API error:', err);
  res.status(500).json({ message: 'Server error. Please try again.' });
});

if (!SECRET || SECRET.length < 32 || SECRET.startsWith('replace_') || !process.env.MONGODB_URI) {
  console.error('Configure MONGODB_URI and unique JWT_SECRET (32+ chars) in server/.env');
  process.exit(1);
}
mongoose.connect(process.env.MONGODB_URI)
  .then(() => app.listen(PORT, () => console.log(`Rayana HR API listening on http://localhost:${PORT}`)))
  .catch(e => { console.error('MongoDB connection error:', e.message); process.exit(1); });
