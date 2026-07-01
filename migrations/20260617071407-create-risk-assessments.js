module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('risk_assessments', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      qr_code: { type: Sequelize.STRING(32), allowNull: false },
      assessed_at: { type: Sequelize.DATE, allowNull: false },
      risk_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      risk_level: { type: Sequelize.STRING(16), allowNull: false },
      rule_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      ml_score: { type: Sequelize.DECIMAL(5, 2) },
      ml_model_version: { type: Sequelize.STRING(64) },
      reasons_json: { type: Sequelize.TEXT, allowNull: false },
      features_json: { type: Sequelize.TEXT, allowNull: false },
      event_window_from: { type: Sequelize.DATE },
      event_window_to: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('GETUTCDATE()') }
    });

    // ⚡ Match schema.sql historical risk lookup sorting index
    await queryInterface.addIndex('risk_assessments', [
      'qr_code', 
      { attribute: 'assessed_at', order: 'DESC' }
    ], {
      name: 'IX_risk_assessments_qr'
    });
  },

  async down(queryInterface) {
    // 🛡️ Safe rollback execution paths
    try {
      await queryInterface.removeIndex('risk_assessments', 'IX_risk_assessments_qr');
    } catch (err) {
      console.log('Index IX_risk_assessments_qr not found, skipping...');
    }

    await queryInterface.dropTable('risk_assessments');
  }
};