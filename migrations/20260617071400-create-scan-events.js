module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('scan_events', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true
      },
      event_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true
      },
      occurred_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      qr_code: {
        type: Sequelize.STRING(32),
        allowNull: false
      },
      event_type: {
        type: Sequelize.STRING(32),
        allowNull: false
      },
      latitude: {
        type: Sequelize.DECIMAL(9, 6)
      },
      longitude: {
        type: Sequelize.DECIMAL(9, 6)
      },
      location_label: {
        type: Sequelize.STRING(256)
      },
      actor_id: {
        type: Sequelize.STRING(128)
      },
      source_distributor_id: {
        type: Sequelize.INTEGER
      },
      source_dealer_id: {
        type: Sequelize.INTEGER
      },
      metadata_json: {
        type: Sequelize.TEXT
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETUTCDATE()')
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('scan_events');
  }
};