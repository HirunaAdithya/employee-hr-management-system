import 'dotenv/config';
import mongoose from 'mongoose';
import { User, Department, Employee, Attendance, Leave, Payroll, Audit } from '../src/models.js';

// Optional FICTIONAL dataset. Only run against a new, empty Rayana demo database.
const sample = [
  ['Nimal Perera','Tour Operations','Senior Tour Coordinator',115000,'English, Sinhala'],
  ['Amaya Fernando','Reservations & Ticketing','Reservations Executive',92000,'English, Sinhala'],
  ['Kavindu Silva','Transport & Guides','Tour Guide',87000,'English, German, Sinhala'],
  ['Rashmi Jayawardena','Guest Relations','Guest Experience Officer',89000,'English, French'],
  ['Tharindu Wijesinghe','Sales & Marketing','Marketing Executive',97000,'English, Sinhala'],
  ['Dilani Gunasekara','Finance & Administration','Accounts Executive',105000,'English, Sinhala'],
  ['Isuru Bandara','Transport & Guides','Transport Supervisor',101000,'English, Sinhala'],
  ['Sewmi Wickramasinghe','Tour Operations','Travel Consultant',93000,'English, Sinhala'],
  ['Chathura De Alwis','Reservations & Ticketing','Ticketing Officer',81000,'English, Sinhala'],
  ['Mihiri Rathnayake','Guest Relations','Airport Representative',84000,'English, Sinhala'],
  ['Dineth Samarasinghe','Sales & Marketing','Business Development Officer',108000,'English, Sinhala'],
  ['Nethmi Dissanayake','Finance & Administration','HR Assistant',79000,'English, Sinhala']
];

const dayFor = (date, delta=0) => {
  const adjusted = new Date(date.getTime()+delta*86400000);
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Colombo',year:'numeric',month:'2-digit',day:'2-digit'}).format(adjusted);
};

try {
  if (process.env.CONFIRM_DEMO_SEED !== 'YES') throw Error('Set CONFIRM_DEMO_SEED=YES in server/.env to confirm fictional demo data creation.');
  if (!process.env.MONGODB_URI) throw Error('MONGODB_URI missing');
  await mongoose.connect(process.env.MONGODB_URI);
  if (await Employee.countDocuments() !== 0) throw Error('Database already contains employees. Demo seeding refused to avoid mixing with real records.');
  const admin=await User.findOne({role:'admin'});
  if(!admin) throw Error('Run npm run seed first to create the admin account.');
  const departments=await Department.find();
  if(departments.length<6) throw Error('Run npm run seed first to create departments.');
  const byName=new Map(departments.map(d=>[d.name,d._id]));
  const now=new Date(),day=dayFor(now),month=day.slice(0,7);
  for(let i=0;i<sample.length;i++){
    const [name,dep,designation,baseSalary,languages]=sample[i];
    const id=`RAY-DEMO-${String(i+1).padStart(3,'0')}`;
    const employee=await Employee.create({employeeNo:id,name,email:`demo${i+1}@rayana.example`,department:byName.get(dep),designation,baseSalary,languages,phone:'',joiningDate:`202${2+i%4}-0${i%8+1}-12`,employmentType:i===11?'Intern':'Full-time',status:'Active',guideLicense:dep==='Transport & Guides'?`FICTIONAL-${i+101}`:''});
    if(i<9){
      const checkIn=new Date(`${day}T${i%4===0?'04:25:00':'03:25:00'}Z`);
      await Attendance.create({employee:employee.id,day,checkIn,status:i%4===0?'Late':'Present',source:'HR entry'});
    }
    if(i<7){
      const status=['Pending','Approved','Pending','Rejected','Approved','Pending','Approved'][i];
      await Leave.create({employee:employee.id,type:['Annual','Casual','Sick'][i%3],from:dayFor(now,7+i*3),to:dayFor(now,8+i*3),days:2,reason:'Fictional sample leave request for demonstration',status,reviewedBy:status==='Pending'?null:admin._id,reviewedAt:status==='Pending'?null:now});
    }
    await Payroll.create({employee:employee.id,month,base:baseSalary,allowances:4000+i*200,deductions:2500,net:baseSalary+4000+i*200-2500,status:i<4?'Paid':'Draft',paidAt:i<4?now:null,createdBy:admin._id,notes:'FICTIONAL demo payroll; not a real salary statement'});
  }
  await Audit.create({actor:admin._id,action:'demo.seed',detail:'12 fictional employees, attendance, leaves and payroll inserted'});
  console.log('Created 12 FICTIONAL demo employees with attendance, leave and payroll. Do not use these records for real HR decisions.');
} catch(e){console.error('Demo seed failed:',e.message);process.exitCode=1;}
finally {await mongoose.disconnect();}
