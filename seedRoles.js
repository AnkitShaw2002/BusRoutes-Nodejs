require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('./app/models/Role');

const roles = [
    {
        name: 'admin',
        description: 'Full system access to manage buses, routes, trips, bookings, users, and reports.',
        permissions: [
            'admin:dashboard',
            'buses:manage',
            'seatlayouts:manage',
            'routes:manage',
            'trips:manage',
            'fares:manage',
            'bookings:manage',
            'users:manage',
            'coupons:manage',
            'payments:manage',
            'reports:view',
            'settings:manage'
        ]
    },
    {
        name: 'staff',
        description: 'Booking staff responsible for offline bookings, passenger management, and ticket printing.',
        permissions: [
            'admin:dashboard',
            'trips:view',
            'bookings:create',
            'bookings:manage',
            'passengers:manage',
            'tickets:print',
            'payments:verify'
        ]
    },
    {
        name: 'driver',
        description: 'Assigned bus drivers who can view trip schedules and passenger manifests.',
        permissions: [
            'trips:view-assigned',
            'passengers:manifest-view'
        ]
    },
    {
        name: 'customer',
        description: 'Standard passenger account for searching buses, booking seats, and managing profile.',
        permissions: [
            'buses:search',
            'bookings:create',
            'bookings:cancel',
            'tickets:download',
            'profile:manage'
        ]
    }
];

const seedRoles = async () => {
    try {
        const mongoURI = process.env.MONGO_URI || process.env.MONGO_URL;
        if (!mongoURI) {
            throw new Error('Database connection URI not found in environment variables');
        }

        await mongoose.connect(mongoURI);
        console.log('✅ Database connected for role seeding');

        for (const roleData of roles) {
            const existingRole = await Role.findOne({ name: roleData.name });
            if (!existingRole) {
                await Role.create(roleData);
                console.log(`🆕 Role created: ${roleData.name}`);
            } else {
                existingRole.permissions = roleData.permissions;
                existingRole.description = roleData.description;
                await existingRole.save();
                console.log(`🔄 Role updated: ${roleData.name}`);
            }
        }

        console.log('✨ All bus agency roles seeded successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Role seeding error:', error.message);
        process.exit(1);
    }
};

seedRoles();