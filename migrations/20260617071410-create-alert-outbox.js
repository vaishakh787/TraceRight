module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('alert_outbox', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      qr_code: { type: Sequelize.STRING(32), allowNull: false },
      risk_level: { type: Sequelize.STRING(16), allowNull: false },
      payload_json: { type: Sequelize.TEXT, allowNull: false },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'PENDING' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('GETUTCDATE()') },
      sent_at: { type: Sequelize.DATE },
      last_error: { type: Sequelize.STRING(512) }
    });

    // ⚡ Optimization for asynchronous outbox background alert workers
    await queryInterface.addIndex('alert_outbox', ['status', 'created_at'], {
      name: 'IX_alert_outbox_pending'
    });
  },

  async down(queryInterface) {
    // 🛡️ Safe rollback execution paths
    try {
      await queryInterface.removeIndex('alert_outbox', 'IX_alert_outbox_pending');
    } catch (err) {
      console.log('Index IX_alert_outbox_pending not found, skipping...');
    }

    await queryInterface.dropTable('alert_outbox');
  }
};