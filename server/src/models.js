import mongoose from 'mongoose';

const options = { timestamps: true };
const { Schema, model } = mongoose;

const User = model('User', new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'hr', 'employee'], required: true, default: 'employee' },
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
  active: { type: Boolean, default: true }
}, options));

const Department = model('Department', new Schema({
  name: { type: String, required: true, trim: true, unique: true, maxlength: 100 },
  description: { type: String, default: '', maxlength: 300 }
}, options));

const Employee = model('Employee', new Schema({
  employeeNo: { type: String, required: true, uppercase: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  phone: { type: String, default: '', trim: true, maxlength: 40 },
  department: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
  designation: { type: String, required: true, trim: true, maxlength: 100 },
  joiningDate: { type: String, required: true },
  employmentType: { type: String, enum: ['Full-time','Part-time','Contract','Intern'], default: 'Full-time' },
  status: { type: String, enum: ['Active','On Leave','Inactive'], default: 'Active' },
  baseSalary: { type: Number, default: 0, min: 0, max: 100000000 },
  languages: { type: String, default: '', maxlength: 200 },
  guideLicense: { type: String, default: '', maxlength: 100 },
  emergencyContact: { type: String, default: '', maxlength: 100 },
  address: { type: String, default: '', maxlength: 250 }
}, options));

const attendanceSchema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  day: { type: String, required: true },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, default: null },
  status: { type: String, enum: ['Present','Late'], default: 'Present' },
  source: { type: String, enum: ['Self-service','HR entry'], default: 'Self-service' }
}, options);
attendanceSchema.index({ employee: 1, day: 1 }, { unique: true });
const Attendance = model('Attendance', attendanceSchema);

const Leave = model('Leave', new Schema({
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  type: { type: String, enum: ['Annual','Casual','Sick','Unpaid','Other'], required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  days: { type: Number, required: true, min: 1 },
  reason: { type: String, required: true, maxlength: 500 },
  status: { type: String, enum: ['Pending','Approved','Rejected'], default: 'Pending' },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, default: '', maxlength: 300 }
}, options));

const payrollSchema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  month: { type: String, required: true },
  base: { type: Number, required: true, min: 0 },
  allowances: { type: Number, default: 0, min: 0 },
  deductions: { type: Number, default: 0, min: 0 },
  net: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['Draft','Paid'], default: 'Draft' },
  paidAt: { type: Date, default: null },
  notes: { type: String, default: '', maxlength: 300 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, options);
payrollSchema.index({ employee: 1, month: 1 }, { unique: true });
const Payroll = model('Payroll', payrollSchema);

const Audit = model('Audit', new Schema({
  actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true, maxlength: 100 },
  detail: { type: String, default: '', maxlength: 240 }
}, options));

export { User, Department, Employee, Attendance, Leave, Payroll, Audit };
