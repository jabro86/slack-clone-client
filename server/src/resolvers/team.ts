import { formatErrors } from "../formatErrors";
import { requiresAuth } from "../permissions";

export default {
	Query: {
		getTeamMembers: requiresAuth.createResolver(
			async (parent, { teamId }, { models }) => {
				return models.sequelize.query(
					"select * from users as u join members as m on m.user_id = u.id " +
						"where m.team_id = ?",
					{
						replacements: [teamId],
						model: models.User,
						raw: true
					}
				);
			}
		)
	},
	Mutation: {
		addTeamMember: requiresAuth.createResolver(
			async (parent, { email, teamId }, { models, user }) => {
				try {
					const memberPromise = models.Member.findOne(
						{ where: { teamId, userId: user.id } },
						{ raw: true }
					);
					const userToAddPromise = models.User.findOne(
						{ where: { email } },
						{ raw: true }
					);
					const [member, userToAdd] = await Promise.all([
						memberPromise,
						userToAddPromise
					]);
					if (!member.admin) {
						return {
							ok: false,
							errors: [
								{ path: "email", message: "You cannot add members to the team" }
							]
						};
					}
					if (!userToAdd) {
						return {
							ok: false,
							errors: [
								{
									path: "email",
									message: "Could not find user with this email"
								}
							]
						};
					}
					await models.Member.create({ userId: userToAdd.id, teamId });
					return {
						ok: true
					};
				} catch (error) {
					return {
						ok: false,
						errors: formatErrors(error, models)
					};
				}
			}
		),
		createTeam: requiresAuth.createResolver(
			async (parent, args, { models, user }) => {
				try {
					// transaction helps to throw an error when either the team or the channel
					// can not be created
					const response = await models.sequelize.transaction(
						async transaction => {
							const team = await models.Team.create(
								{ ...args },
								{ transaction }
							);
							await models.Channel.create(
								{
									name: "general",
									public: true,
									teamId: team.id
								},
								{ transaction }
							);
							await models.Member.create(
								{
									teamId: team.id,
									userId: user.id,
									admin: true
								},
								{ transaction }
							);
							return team;
						}
					);

					return {
						ok: true,
						team: response
					};
				} catch (error) {
					return {
						ok: false,
						errors: formatErrors(error, models)
					};
				}
			}
		)
	},
	Team: {
		channels: ({ id }, args, { models, user }) =>
			models.sequelize.query(
				"select distinct on (id) * from channels as c " +
					"left outer join pcmembers as pc " +
					"on c.id = pc.channel_id " +
					"where team_id = :teamId and (public = true or " +
					"(pc.user_id = :userId and c.id = pc.channel_id));",
				{
					replacements: { teamId: id, userId: user.id },
					model: models.Channel,
					raw: true
				}
			),
		directMessageMembers: ({ id }, args, { models, user }) =>
			models.sequelize.query(
				"select distinct on (u.id) u.id, u.username from users as u join direct_messages as dm " +
					"on (u.id = dm.sender_id) or (u.id = dm.receiver_id) " +
					"where (:currentUserId = dm.sender_id or :currentUserId = dm.receiver_id) " +
					"and dm.team_id = :teamId",
				{
					replacements: { currentUserId: user.id, teamId: id },
					model: models.User,
					raw: true
				}
			)
	}
};