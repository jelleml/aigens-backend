const { User } = require('./database').sequelize.models;

async function checkUser() {
    try {
        // Check for the user
        const user = await User.findOne({
            where: { email: 'mr.simone.landi@gmail.com' },
            raw: true
        });

        if (user) {
            console.log('User found:');
            console.log(JSON.stringify(user, null, 2));
        } else {
            console.log('User not found');
        }

        // Check total user count
        const userCount = await User.count();
        console.log(`Total users in database: ${userCount}`);

        process.exit(0);
    } catch (error) {
        console.error('Error checking user:', error);
        process.exit(1);
    }
}

checkUser(); 