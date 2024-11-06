'use client'
import { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Autocomplete,
  Chip,
  Alert
} from '@mui/material';
import { supabase } from '../supabase';

interface Profile {
  id: string;
  username: string;
  email: string;
}

interface CreateGroupDialogProps {
  open: boolean;
  onClose: () => void;
  currentUser: { id: string };
  onGroupCreated: () => void;
}

export default function CreateGroupDialog({
  open,
  onClose,
  currentUser,
  onGroupCreated
}: CreateGroupDialogProps) {
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Profile[]>([]);
  const [availableUsers, setAvailableUsers] = useState<Profile[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const searchUsers = async (term: string) => {
    if (term.length < 2) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('email', `%${term}%`)
        .neq('id', currentUser.id);

      console.log('Search users result:', { data, error });

      if (error) throw error;
      if (data) setAvailableUsers(data);
    } catch (err) {
      console.error('Error searching users:', err);
      setError('Failed to search users');
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) {
      setError('Please enter a group name and select at least one user');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert([{
          name: groupName.trim(),
          created_by: currentUser.id
        }])
        .select()
        .single();

      if (groupError) throw groupError;
      if (!group) throw new Error('No group data returned');

      const members = [
        { group_id: group.id, user_id: currentUser.id },
        ...selectedUsers.map(user => ({
          group_id: group.id,
          user_id: user.id
        }))
      ];

      const { error: membersError } = await supabase
        .from('group_members')
        .insert(members);

      if (membersError) throw membersError;

      const { error: messageError } = await supabase
        .from('group_messages')
        .insert([{
          group_id: group.id,
          sender_id: currentUser.id,
          content: 'Group created'
        }]);

      if (messageError) throw messageError;

      onGroupCreated();
      onClose();
      setGroupName('');
      setSelectedUsers([]);
    } catch (err: any) {
      console.error('Error in group creation:', err);
      setError(err.message || 'Failed to create group. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Group</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          autoFocus
          margin="dense"
          label="Group Name"
          fullWidth
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          sx={{ mb: 2 }}
        />
        <Autocomplete
          multiple
          options={availableUsers}
          getOptionLabel={(option) => option.email || ''}
          value={selectedUsers}
          onChange={(_, newValue) => setSelectedUsers(newValue)}
          onInputChange={(_, value) => searchUsers(value)}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Add Members"
              margin="dense"
              fullWidth
            />
          )}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => (
              <Chip
                label={option.email}
                {...getTagProps({ index })}
                key={option.id}
              />
            ))
          }
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button 
          onClick={handleCreateGroup}
          variant="contained"
          disabled={loading || !groupName.trim() || selectedUsers.length === 0}
        >
          {loading ? 'Creating...' : 'Create Group'}
        </Button>
      </DialogActions>
    </Dialog>
  );
} 
