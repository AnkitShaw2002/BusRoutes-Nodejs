require("dotenv").config();
const bcrypt = require("bcryptjs");
const connectDB = require("./app/config/db");
const Role = require("./app/models/Role");
const User = require("./app/models/User");

(async () => {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    throw new Error("Set ADMIN_NAME, ADMIN_EMAIL, and an ADMIN_PASSWORD of at least 12 characters before running npm run seed:admin.");
  }
  await connectDB();
  const role = await Role.findOne({ name: "admin" });
  if (!role) throw new Error("Admin role not found. Run npm run seed first.");
  const email = ADMIN_EMAIL.toLowerCase().trim();
  if (await User.exists({ email })) throw new Error("An account with ADMIN_EMAIL already exists; no account was changed.");
  const password = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await User.create({ name: ADMIN_NAME.trim(), email, password, roleId: role._id, isVerified: true, status: "active" });
  console.log(`Admin account created for ${admin.email}.`);
  await require("mongoose").disconnect();
})().catch(async (error) => {
  console.error(error.message);
  await require("mongoose").disconnect();
  process.exit(1);
});
