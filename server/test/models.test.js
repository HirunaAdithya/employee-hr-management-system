import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { User, Employee, Attendance, Leave, Payroll } from '../src/models.js';

const oid = () => new mongoose.Types.ObjectId();

test('employee model accepts tourism-specific profile fields', async () => {
  const e = new Employee({ employeeNo: 'RAY-TEST-001', name: 'Fictional Test', email: 'test@example.com', department: oid(), designation: 'Tour Guide', joiningDate: '2026-10-12', languages: 'English, German', guideLicense: 'TEST-LICENSE', baseSalary: 55000 });
  await e.validate();
  assert.equal(e.employeeNo, 'RAY-TEST-001');
  assert.equal(e.status, 'Active');
});

test('employee model rejects missing department and negative salary', async () => {
  const e = new Employee({ employeeNo: 'RAY-TEST-002', name: 'Fictional Test', email: 'test2@example.com', designation: 'Coordinator', joiningDate: '2026-10-12', baseSalary: -1 });
  await assert.rejects(() => e.validate(), /department:|baseSalary:/i);
});

test('attendance must be unique per employee and day', () => {
  assert.ok(Attendance.schema.indexes().some(([fields, options]) => fields.employee === 1 && fields.day === 1 && options.unique));
});

test('payroll must be unique per employee and month', () => {
  assert.ok(Payroll.schema.indexes().some(([fields, options]) => fields.employee === 1 && fields.month === 1 && options.unique));
});

test('leave requests default to pending', async () => {
  const leave = new Leave({ employee: oid(), type: 'Annual', from: '2026-10-12', to: '2026-10-13', days: 2, reason: 'Fictional annual leave' });
  await leave.validate();
  assert.equal(leave.status, 'Pending');
});

test('password hashes are excluded from normal user queries', () => {
  assert.equal(User.schema.path('passwordHash').options.select, false);
});
