module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('alert_outbox', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true
      },
      qr_code: {
        type: Sequelize.STRING(32),
        allowNull: false
      },
      risk_level: {
        type: Sequelize.STRING(16),
        allowNull: false
      },
      payload_json: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'PENDING'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETUTCDATE()')
      },
      sent_at: {
        type: Sequelize.DATE
      },
      last_error: {
        type: Sequelize.STRING(512)
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('alert_outbox');
  }
};