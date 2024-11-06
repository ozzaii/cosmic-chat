            'use client'

            import { useEffect, useState, useRef } from 'react';
            import { supabase } from '../supabase';
            import { useRouter } from 'next/navigation';
            import {
              Box,
              List,
              ListItem,
              ListItemText,
              ListItemAvatar,
              Avatar,
              AppBar,
              Toolbar,
              Typography,
              TextField,
              Button,
              Paper,
              Drawer,
              IconButton,
              Dialog,
              DialogTitle,
              DialogContent,
              DialogActions,
              CircularProgress,
              Divider,
              Chip,
              Alert,
              Autocomplete,
            } from '@mui/material';
            import {
              Send as SendIcon,
              Search as SearchIcon,
              Menu as MenuIcon,
              Add as AddIcon,
              AddCircleOutline as AddIconCircle,
              Group as GroupIcon,
            } from '@mui/icons-material';
            import CreateGroupDialog from '../components/CreateGroupDialog';

            interface Profile {
              id: string;
              username?: string;
              email: string;
            }

            interface Message {
              id: string;
              content: string;
              sender_id: string;
              receiver_id: string;
              created_at: string;
              sender?: Profile;
              receiver?: Profile;
            }

            interface GroupMessage {
              id: string;
              content: string;
              sender_id: string;
              group_id: string;
              created_at: string;
              sender?: Profile;
            }

            interface ChatType {
              id: string;
              type: 'direct' | 'group';
              name: string;
              lastMessage?: Message | GroupMessage | null;
            }

            interface CurrentUser {
              id: string;
              email: string;
              username: string;
              avatar_url?: string;
            }

            interface GroupMember {
              id: string;
              username: string;
              email: string;
            }

            interface GroupDetails {
              id: string;
              name: string;
              members: GroupMember[];
            }

            export default function ChatPage() {
              const router = useRouter();
              const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
              const [messages, setMessages] = useState<(Message | GroupMessage)[]>([]);
              const [newMessage, setNewMessage] = useState('');
              const [selectedChat, setSelectedChat] = useState<string | null>(null);
              const [chats, setChats] = useState<ChatType[]>([]);
              const [drawerOpen, setDrawerOpen] = useState(false);
              const [newChatDialog, setNewChatDialog] = useState(false);
              const [searchEmail, setSearchEmail] = useState('');
              const [searchError, setSearchError] = useState('');
              const messagesEndRef = useRef<null | HTMLDivElement>(null);
              const [newGroupDialog, setNewGroupDialog] = useState(false);
              const [selectedChatType, setSelectedChatType] = useState<'direct' | 'group'>('direct');
              const [isLoading, setIsLoading] = useState(false);
              const [polling, setPolling] = useState<NodeJS.Timeout | null>(null);
              const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null);
              const [groupMembersDialogOpen, setGroupMembersDialogOpen] = useState(false);
              const sentMessageIds = useRef(new Set<string>());

              useEffect(() => {
                checkUser();
              }, []);

              useEffect(() => {
                let cleanup: (() => void) | undefined;

                if (currentUser && selectedChat) {
                  cleanup = setupRealtimeSubscription();
                }

                return () => {
                  if (cleanup) {
                    cleanup();
                  }
                };
              }, [currentUser, selectedChat]);

              useEffect(() => {
                if (selectedChat) {
                  fetchInitialMessages(selectedChat);
                }
              }, [selectedChat]);

              useEffect(() => {
                scrollToBottom();
              }, [messages]);

              const scrollToBottom = () => {
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
              };

              async function checkUser() {
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) {
                    router.push('/');
                    return;
                  }

                  console.log('Current session user:', session.user.email);

                  const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();

                  if (profileError) throw profileError;

                  console.log('Setting current user:', profile);
                  setCurrentUser(profile);
                } catch (error) {
                  console.error('Error checking user:', error);
                  router.push('/');
                }
              }

              function setupRealtimeSubscription() {
                if (!currentUser || !selectedChat) return;

                let pollingInterval: NodeJS.Timeout | null = null;
                
                const channel = supabase.channel('chat-changes');

                channel.subscribe(async (status) => {
                  if (status === 'SUBSCRIBED') {
                    console.log('Realtime connected');
                    // Clear polling if it exists
                    if (pollingInterval) {
                      clearInterval(pollingInterval);
                      pollingInterval = null;
                    }
                  } else {
                    console.log('Realtime disconnected, falling back to polling');
                    // Start polling only if realtime fails
                    if (!pollingInterval) {
                      pollingInterval = setInterval(checkNewMessages, 3000);
                    }
                  }
                });

                // Subscribe to direct messages
                channel.on(
                  'postgres_changes',
                  {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                  },
                  async (payload) => {
                    const newMessage = payload.new as Message;
                    
                    // Check if message belongs to current chat
                    if ((newMessage.sender_id === currentUser.id && newMessage.receiver_id === selectedChat) ||
                        (newMessage.sender_id === selectedChat && newMessage.receiver_id === currentUser.id)) {
                      
                      // Fetch sender details
                      const { data: sender } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', newMessage.sender_id)
                        .single();

                      setMessages(prev => {
                        // Prevent duplicates
                        if (prev.some(msg => msg.id === newMessage.id)) {
                          return prev;
                        }
                        return [...prev, { ...newMessage, sender }];
                      });
                    }
                  }
                );

                // Subscribe to group messages
                channel.on(
                  'postgres_changes',
                  {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'group_messages',
                  },
                  async (payload) => {
                    const newMessage = payload.new as GroupMessage;
                    
                    // Check if message belongs to current group
                    if (newMessage.group_id === selectedChat) {
                      // Fetch sender details
                      const { data: sender } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', newMessage.sender_id)
                        .single();

                      setMessages(prev => {
                        // Prevent duplicates
                        if (prev.some(msg => msg.id === newMessage.id)) {
                          return prev;
                        }
                        return [...prev, { ...newMessage, sender }];
                      });
                    }
                  }
                );

                return () => {
                  channel.unsubscribe();
                  if (pollingInterval) {
                    clearInterval(pollingInterval);
                  }
                };
              }

              const handleSend = async () => {
                if (!newMessage.trim() || !selectedChat || !currentUser) return;

                const messageContent = newMessage.trim();
                setNewMessage('');
                
                // Generate a temporary ID for tracking
                const tempId = `temp-${Date.now()}`;

                try {
                  const selectedChatData = chats.find(chat => chat.id === selectedChat);
                  
                  if (selectedChatData?.type === 'direct') {
                    // Check if we've already sent this message
                    if (sentMessageIds.current.has(tempId)) {
                      return;
                    }
                    
                    // Mark message as being sent
                    sentMessageIds.current.add(tempId);

                    const { data: newMsg, error } = await supabase
                      .from('messages')
                      .insert([{
                        content: messageContent,
                        sender_id: currentUser.id,
                        receiver_id: selectedChat
                      }])
                      .select(`
                        *,
                        sender:profiles!messages_sender_id_fkey(*)
                      `)
                      .single();

                    if (error) throw error;
                    
                    // Add message and clean up tracking
                    setMessages(prev => {
                      if (prev.some(msg => msg.id === newMsg.id)) {
                        return prev;
                      }
                      return [...prev, newMsg];
                    });
                    
                    // Remove from tracking after a delay
                    setTimeout(() => {
                      sentMessageIds.current.delete(tempId);
                    }, 5000);

                  } else {
                    // Check if we've already sent this message
                    if (sentMessageIds.current.has(tempId)) {
                      return;
                    }
                    
                    // Mark message as being sent
                    sentMessageIds.current.add(tempId);

                    const { data: newMsg, error } = await supabase
                      .from('group_messages')
                      .insert([{
                        content: messageContent,
                        sender_id: currentUser.id,
                        group_id: selectedChat
                      }])
                      .select(`
                        *,
                        sender:profiles!group_messages_sender_id_fkey(*)
                      `)
                      .single();

                    if (error) throw error;
                    
                    // Add message and clean up tracking
                    setMessages(prev => {
                      if (prev.some(msg => msg.id === newMsg.id)) {
                        return prev;
                      }
                      return [...prev, newMsg];
                    });
                    
                    // Remove from tracking after a delay
                    setTimeout(() => {
                      sentMessageIds.current.delete(tempId);
                    }, 5000);
                  }
                } catch (error) {
                  console.error('Error sending message:', error);
                  // Remove from tracking on error
                  sentMessageIds.current.delete(tempId);
                }
              };

              async function startNewChat() {
                setSearchError('');

                const { data: profile, error } = await supabase
                  .from('profiles')
                  .select('*')
                  .eq('email', searchEmail)
                  .single();

                if (error || !profile) {
                  setSearchError('User not found');
                  return;
                }

                if (profile.id === currentUser?.id) {
                  setSearchError("You can't chat with yourself!");
                  return;
                }

                setSelectedChat(profile.id);
                setNewChatDialog(false);
                setSearchEmail('');
                await fetchInitialMessages(profile.id);
              }

              const handleLogout = async () => {
                await supabase.auth.signOut();
                localStorage.clear();
                router.push('/');
              };

              const getSelectedChatUser = () => {
                const selectedChatData = chats.find(chat => chat.id === selectedChat);
                if (!selectedChatData) return null;

                return {
                  username: selectedChatData.name,
                  id: selectedChatData.id
                };
              };

              const handleGroupCreated = () => {
                if (currentUser) {
                  fetchChats(currentUser.id);
                }
              };

              const handleChatSelect = async (chatId: string, chatType: 'direct' | 'group') => {
                setSelectedChat(chatId);
                setSelectedChatType(chatType);
                setDrawerOpen(false);
                await fetchInitialMessages(chatId);
                
                if (chatType === 'group') {
                  await fetchGroupDetails(chatId);
                }
              };

              const fetchChats = async (userId: string) => {
                try {
                  // Fetch direct messages
                  const { data: directChats, error: directError } = await supabase
                    .from('messages')
                    .select(`
                      *,
                      sender:profiles!messages_sender_id_fkey(*),
                      receiver:profiles!messages_receiver_id_fkey(*)
                    `)
                    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
                    .order('created_at', { ascending: false });

                  if (directError) throw directError;

                  // Fetch groups user is a member of
                  const { data: groupMemberships, error: groupError } = await supabase
                    .from('group_members')
                    .select(`
                      group_id,
                      groups!group_members_group_id_fkey(
                        id,
                        name,
                        created_by,
                        group_messages(
                          id,
                          content,
                          created_at,
                          sender:profiles!group_messages_sender_id_fkey(*)
                        )
                      )
                    `)
                    .eq('user_id', userId);

                  if (groupError) throw groupError;

                  // Process direct chats
                  const directChatsMap = new Map();
                  directChats?.forEach(message => {
                    const otherUser = message.sender_id === userId ? message.receiver : message.sender;
                    const chatId = message.sender_id === userId ? message.receiver_id : message.sender_id;
                    
                    if (!directChatsMap.has(chatId) && otherUser) {
                      directChatsMap.set(chatId, {
                        id: chatId,
                        type: 'direct',
                        name: otherUser.username || otherUser.email,
                        lastMessage: message
                      });
                    }
                  });

                  // Process groups
                  const groupChats = groupMemberships?.map(membership => {
                    const group = membership.groups;
                    const lastMessage = group.group_messages?.[0] || null;
                    return {
                      id: group.id,
                      type: 'group',
                      name: group.name,
                      lastMessage
                    };
                  }) || [];

                  // Combine and sort all chats
                  const allChats = [...directChatsMap.values(), ...groupChats].sort((a, b) => {
                    const aTime = a.lastMessage?.created_at || '0';
                    const bTime = b.lastMessage?.created_at || '0';
                    return bTime.localeCompare(aTime);
                  });

                  setChats(allChats);
                } catch (error) {
                  console.error('Error fetching chats:', error);
                }
              };

              const fetchInitialMessages = async (chatId: string) => {
                if (!currentUser) return;
                
                const selectedChatData = chats.find(chat => chat.id === chatId);
                
                try {
                  if (selectedChatData?.type === 'direct') {
                    const { data, error } = await supabase
                      .from('messages')
                      .select(`
                        *,
                        sender:profiles!fk_messages_sender(*)
                      `)
                      .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${chatId}),and(sender_id.eq.${chatId},receiver_id.eq.${currentUser.id})`)
                      .order('created_at', { ascending: true });

                    if (error) throw error;
                    setMessages(data || []);
                  } else {
                    const { data, error } = await supabase
                      .from('group_messages')
                      .select(`
                        *,
                        sender:profiles(*)
                      `)
                      .eq('group_id', chatId)
                      .order('created_at', { ascending: true });

                    if (error) throw error;
                    setMessages(data || []);
                  }
                } catch (error) {
                  console.error('Error fetching messages:', error);
                }
              };

              const fetchGroupDetails = async (groupId: string) => {
                try {
                  // Fetch group members
                  const { data: members, error: membersError } = await supabase
                    .from('group_members')
                    .select(`
                      user_id,
                      profiles:profiles!group_members_user_id_fkey(
                        id,
                        username,
                        email
                      )
                    `)
                    .eq('group_id', groupId);

                  if (membersError) throw membersError;

                  // Fetch group info
                  const { data: group, error: groupError } = await supabase
                    .from('groups')
                    .select('*')
                    .eq('id', groupId)
                    .single();

                  if (groupError) throw groupError;

                  setGroupDetails({
                    id: group.id,
                    name: group.name,
                    members: members.map(m => ({
                      id: m.profiles.id,
                      username: m.profiles.username,
                      email: m.profiles.email
                    }))
                  });
                } catch (error) {
                  console.error('Error fetching group details:', error);
                }
              };

              const fetchNewMessages = async () => {
                if (!selectedChat || !currentUser) return;

                try {
                  const lastMessage = messages[messages.length - 1];
                  const lastTimestamp = lastMessage?.created_at || new Date().toISOString();
                  const selectedChatData = chats.find(chat => chat.id === selectedChat);
                  
                  let query;
                  if (selectedChatData?.type === 'direct') {
                    query = supabase
                      .from('messages')
                      .select(`
                        *,
                        sender:profiles!fk_messages_sender(*)
                      `)
                      .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedChat}),and(sender_id.eq.${selectedChat},receiver_id.eq.${currentUser.id})`)
                      .gt('created_at', lastTimestamp)
                      .order('created_at', { ascending: true })
                      .limit(1); // Only fetch the latest message if it exists
                  } else {
                    query = supabase
                      .from('group_messages')
                      .select(`
                        *,
                        sender:profiles(*)
                      `)
                      .eq('group_id', selectedChat)
                      .gt('created_at', lastTimestamp)
                      .order('created_at', { ascending: true })
                      .limit(1); // Only fetch the latest message if it exists
                  }

                  const { data, error } = await query;

                  if (!error && data && data.length > 0) {
                    setMessages(prev => [...prev, ...data]);
                    // Only scroll to bottom if we're already near the bottom
                    const chatContainer = messagesEndRef.current?.parentElement;
                    if (chatContainer) {
                      const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 100;
                      if (isNearBottom) {
                        scrollToBottom();
                      }
                    }
                  }
                } catch (error) {
                  console.error('Error fetching new messages:', error);
                }
              };

              useEffect(() => {
                const interval = setInterval(fetchNewMessages, 1000);
                return () => clearInterval(interval);
              }, [selectedChat, currentUser]); // Remove messages dependency

              const GroupMembersDialog = ({ open, onClose }: { open: boolean, onClose: () => void }) => {
                const [newMemberEmail, setNewMemberEmail] = useState('');
                const [error, setError] = useState('');
                const [loading, setLoading] = useState(false);
                const [members, setMembers] = useState<GroupMember[]>([]);

                useEffect(() => {
                  if (open && selectedChat) {
                    fetchMembers();
                  }
                }, [open]);

                const fetchMembers = async () => {
                  try {
                    const { data, error } = await supabase
                      .from('group_members')
                      .select(`
                        user_id,
                        profiles:profiles!group_members_user_id_fkey(
                          id,
                          username,
                          email
                        )
                      `)
                      .eq('group_id', selectedChat);

                    if (error) throw error;
                    setMembers(data.map(m => ({
                      id: m.profiles.id,
                      username: m.profiles.username,
                      email: m.profiles.email
                    })));
                  } catch (error) {
                    console.error('Error fetching members:', error);
                  }
                };

                const handleAddMember = async () => {
                  if (!selectedChat || !newMemberEmail.trim()) return;
                  setLoading(true);
                  setError('');

                  try {
                    const { data: user, error: userError } = await supabase
                      .from('profiles')
                      .select('*')
                      .eq('email', newMemberEmail)
                      .single();

                    if (userError || !user) {
                      setError('User not found');
                      return;
                    }

                    if (members.some(m => m.id === user.id)) {
                      setError('User is already a member');
                      return;
                    }

                    const { error: memberError } = await supabase
                      .from('group_members')
                      .insert([{
                        group_id: selectedChat,
                        user_id: user.id
                      }]);

                    if (memberError) throw memberError;

                    await fetchMembers();
                    setNewMemberEmail('');
                    setError('Member added successfully!');
                  } catch (error: any) {
                    setError(error.message);
                  } finally {
                    setLoading(false);
                  }
                };

                return (
                  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
                    <DialogTitle>Group Members</DialogTitle>
                    <DialogContent>
                      {error && (
                        <Alert 
                          severity={error.includes('successfully') ? 'success' : 'error'} 
                          sx={{ mb: 2 }}
                        >
                          {error}
                        </Alert>
                      )}
                      <List>
                        {members.map((member) => (
                          <ListItem key={member.id}>
                            <ListItemAvatar>
                              <Avatar>{member.username?.[0]?.toUpperCase()}</Avatar>
                            </ListItemAvatar>
                            <ListItemText 
                              primary={member.username || member.email}
                              secondary={member.email}
                            />
                          </ListItem>
                        ))}
                      </List>
                      <TextField
                        fullWidth
                        label="Add Member by Email"
                        value={newMemberEmail}
                        onChange={(e) => setNewMemberEmail(e.target.value)}
                        disabled={loading}
                        sx={{ mt: 2 }}
                      />
                    </DialogContent>
                    <DialogActions>
                      <Button onClick={onClose}>Close</Button>
                      <Button 
                        onClick={handleAddMember}
                        variant="contained"
                        disabled={loading || !newMemberEmail.trim()}
                      >
                        {loading ? 'Adding...' : 'Add Member'}
                      </Button>
                    </DialogActions>
                  </Dialog>
                );
              };

              useEffect(() => {
                if (currentUser) {
                  fetchChats(currentUser.id);
                }
              }, [currentUser]);

              // Modify checkNewMessages to be more strict
              const checkNewMessages = async () => {
                if (!selectedChat || !currentUser || !messages.length) return;

                const lastMessage = messages[messages.length - 1];
                const lastMessageTime = lastMessage?.created_at;
                
                try {
                  const selectedChatData = chats.find(chat => chat.id === selectedChat);
                  
                  if (selectedChatData?.type === 'direct') {
                    const { data: newMessages } = await supabase
                      .from('messages')
                      .select('*, sender:profiles!messages_sender_id_fkey(*)')
                      .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedChat}),and(sender_id.eq.${selectedChat},receiver_id.eq.${currentUser.id})`)
                      .gt('created_at', lastMessageTime)
                      .order('created_at', { ascending: true });

                    if (newMessages?.length) {
                      const uniqueMessages = newMessages.filter(
                        newMsg => !messages.some(msg => msg.id === newMsg.id)
                      );
                      if (uniqueMessages.length) {
                        setMessages(prev => [...prev, ...uniqueMessages]);
                      }
                    }
                  } else {
                    const { data: newMessages } = await supabase
                      .from('group_messages')
                      .select('*, sender:profiles!group_messages_sender_id_fkey(*)')
                      .eq('group_id', selectedChat)
                      .gt('created_at', lastMessageTime)
                      .order('created_at', { ascending: true });

                    if (newMessages?.length) {
                      const uniqueMessages = newMessages.filter(
                        newMsg => !messages.some(msg => msg.id === newMsg.id)
                      );
                      if (uniqueMessages.length) {
                        setMessages(prev => [...prev, ...uniqueMessages]);
                      }
                    }
                  }
                } catch (error) {
                  console.error('Error checking new messages:', error);
                }
              };

              // Update the useEffect for message checking
              useEffect(() => {
                if (currentUser && selectedChat) {
                  const interval = setInterval(checkNewMessages, 3000);
                  return () => clearInterval(interval);
                }
              }, [currentUser, selectedChat, messages]);

              if (!currentUser) {
                return (
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                    <CircularProgress />
                  </Box>
                );
              }

              return (
                <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
                  <AppBar position="static" elevation={0}>
                    <Toolbar>
                      <IconButton
                        color="inherit"
                        edge="start"
                        onClick={() => setDrawerOpen(true)}
                      >
                        <MenuIcon />
                      </IconButton>
                      <Typography variant="h6" sx={{ flexGrow: 1, ml: 2 }}>
                        {selectedChat ? getSelectedChatUser()?.username || 'Chat' : 'Cosmic Chat'}
                      </Typography>
                      {selectedChatType === 'group' && (
                        <IconButton
                          color="inherit"
                          onClick={() => setGroupMembersDialogOpen(true)}
                        >
                          <GroupIcon />
                        </IconButton>
                      )}
                      <Button color="inherit" onClick={handleLogout}>
                        Logout
                      </Button>
                    </Toolbar>
                  </AppBar>

                  <Box sx={{ display: 'flex', flexGrow: 1 }}>
                    {/* Chat List */}
                    <Drawer
                      variant="temporary"
                      anchor="left"
                      open={drawerOpen}
                      onClose={() => setDrawerOpen(false)}
                      sx={{
                        width: 300,
                        flexShrink: 0,
                        '& .MuiDrawer-paper': {
                          width: 300,
                          boxSizing: 'border-box',
                        },
                      }}
                    >
                      <Toolbar />
                      <Box sx={{ p: 2 }}>
                        <Button
                          fullWidth
                          variant="contained"
                          startIcon={<AddIcon />}
                          onClick={() => setNewChatDialog(true)}
                          sx={{ mb: 1 }}
                        >
                          New Direct Chat
                        </Button>
                        <Button
                          fullWidth
                          variant="outlined"
                          startIcon={<AddIconCircle />}
                          onClick={() => setNewGroupDialog(true)}
                          sx={{ mb: 1 }}
                        >
                          New Group
                        </Button>
                      </Box>
                      <Divider />
                      <List sx={{ overflow: 'auto', maxHeight: 'calc(100vh - 140px)' }}>
                        {chats.map((chat) => (
                          <ListItem
                            key={chat.id}
                            onClick={() => handleChatSelect(chat.id, chat.type)}
                            sx={{
                              cursor: 'pointer',
                              bgcolor: selectedChat === chat.id ? 'action.selected' : 'transparent',
                              '&:hover': {
                                bgcolor: 'action.hover',
                              }
                            }}
                          >
                            <ListItemAvatar>
                              <Avatar>{chat.name?.[0]?.toUpperCase() || '?'}</Avatar>
                            </ListItemAvatar>
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                  <Typography component="span">{chat.name}</Typography>
                                  {chat.type === 'group' && (
                                    <Chip
                                      label="Group"
                                      size="small"
                                      sx={{ ml: 1 }}
                                      variant="outlined"
                                    />
                                  )}
                                </Box>
                              }
                              secondary={chat.lastMessage?.content || 'No messages yet'}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </Drawer>

                    {/* Chat Window */}
                    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                      {selectedChat ? (
                        <>
                          <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, bgcolor: '#f5f5f5' }}>
                            {messages.map((message) => (
                              <Box
                                key={message.id}
                                sx={{
                                  display: 'flex',
                                  justifyContent: message.sender_id === currentUser.id ? 'flex-end' : 'flex-start',
                                  mb: 1,
                                }}
                              >
                                <Paper
                                  sx={{
                                    p: 2,
                                    maxWidth: '70%',
                                    bgcolor: message.sender_id === currentUser.id ? 'primary.main' : 'white',
                                    color: message.sender_id === currentUser.id ? 'white' : 'inherit',
                                  }}
                                >
                                  <Typography>{message.content}</Typography>
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      display: 'block',
                                      mt: 0.5,
                                      opacity: 0.8
                                    }}
                                  >
                                    {new Date(message.created_at).toLocaleTimeString()}
                                  </Typography>
                                </Paper>
                              </Box>
                            ))}
                            <div ref={messagesEndRef} />
                          </Box>
                          <Box sx={{ p: 2, bgcolor: 'background.paper' }}>
                            <TextField
                              fullWidth
                              value={newMessage}
                              onChange={(e) => setNewMessage(e.target.value)}
                              placeholder="Type a message..."
                              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                              InputProps={{
                                endAdornment: (
                                  <IconButton onClick={() => handleSend()} disabled={!newMessage.trim()}>
                                    <SendIcon />
                                  </IconButton>
                                ),
                              }}
                            />
                          </Box>
                        </>
                      ) : (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            bgcolor: '#f5f5f5',
                          }}
                        >
                          <Typography color="textSecondary">
                            Select a chat or start a new conversation
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>

                  {/* New Chat Dialog */}
                  <Dialog open={newChatDialog} onClose={() => setNewChatDialog(false)}>
                    <DialogTitle>Start New Chat</DialogTitle>
                    <DialogContent>
                      <TextField
                        autoFocus
                        margin="dense"
                        label="Email Address"
                        type="email"
                        fullWidth
                        value={searchEmail}
                        onChange={(e) => setSearchEmail(e.target.value)}
                        error={!!searchError}
                        helperText={searchError}
                      />
                    </DialogContent>
                    <DialogActions>
                      <Button onClick={() => setNewChatDialog(false)}>Cancel</Button>
                      <Button onClick={startNewChat} variant="contained">
                        Start Chat
                      </Button>
                    </DialogActions>
                  </Dialog>

                  {/* New Group Dialog */}
                  <CreateGroupDialog
                    open={newGroupDialog}
                    onClose={() => setNewGroupDialog(false)}
                    currentUser={currentUser}
                    onGroupCreated={handleGroupCreated}
                  />

                  <GroupMembersDialog
                    open={groupMembersDialogOpen}
                    onClose={() => setGroupMembersDialogOpen(false)}
                  />
                </Box>
              );
            }
