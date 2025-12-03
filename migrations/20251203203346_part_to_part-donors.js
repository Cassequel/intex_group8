/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    // Get all participants who have made donations
    const participantsWithDonations = await knex('participants')
      .select('participants.participant_id', 'participants.role')
      .join('donations', 'participants.participant_id', 'donations.participant_id')
      .groupBy('participants.participant_id', 'participants.role');
  
    // Update each participant's role to include 'donor'
    for (const participant of participantsWithDonations) {
      const currentRole = participant.role || 'participant';
      
      // Only add 'donor' if it's not already in the role string
      if (!currentRole.includes('donor')) {
        const roles = currentRole.split('/');
        roles.push('donor');
        const newRole = roles.join('/');
        
        await knex('participants')
          .where('participant_id', participant.participant_id)
          .update({ role: newRole });
      }
    }
  };
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = async function(knex) {
    // Get all participants with 'donor' in their role
    const participantsWithDonorRole = await knex('participants')
      .select('iparticipant_idd', 'role')
      .where('role', 'like', '%donor%');
  
    // Remove 'donor' from each participant's role
    for (const participant of participantsWithDonorRole) {
      const roles = participant.role.split('/');
      const filteredRoles = roles.filter(role => role !== 'donor');
      const newRole = filteredRoles.length > 0 ? filteredRoles.join('/') : 'participant';
      
      await knex('participants')
        .where('participant_id', participant.participant_id)
        .update({ role: newRole });
    }
  };