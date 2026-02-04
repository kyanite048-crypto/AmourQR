import { z } from "zod";

import type { PrismaPromise } from "@prisma/client";

import { createTRPCRouter, protectedProcedure } from "src/server/api/trpc";
import { encodeImageToBlurhash, getColor, imageKit, rgba2hex, uploadImage } from "src/server/imageUtil";
import { categoryInput, id, menuId } from "src/utils/validators";

export const categoryRouter = createTRPCRouter({
    /** Create a new category under a menu of a restaurant */
    create: protectedProcedure.input(categoryInput.merge(menuId)).mutation(async ({ ctx, input }) => {
        const [count, lastCategoryItem] = await ctx.prisma.$transaction([
            ctx.prisma.category.count({ where: { menuId: input.menuId } }),
            ctx.prisma.category.findFirst({
                orderBy: { position: "desc" },
                where: { menuId: input.menuId, userId: ctx.session.user.id },
            }),
        ]);

        const createData = {
            menuId: input.menuId,
            name: input.name,
            position: lastCategoryItem ? lastCategoryItem.position + 1 : 0,
            userId: ctx.session.user.id,
        };

        if (input.imageBase64) {
            const [uploadedResponse, blurHash, color] = await Promise.all([
                uploadImage(input.imageBase64, `user/${ctx.session.user.id}/category`),
                encodeImageToBlurhash(input.imageBase64),
                getColor(input.imageBase64),
            ]);
            createData.imageUrl = uploadedResponse.filePath;
        }

        return ctx.prisma.category.create({
            data: createData,
            include: { items: { include: { image: true } } },
        });
    }),

    /** Delete the category of a menu along with the items and images related to it */
    delete: protectedProcedure.input(id).mutation(async ({ ctx, input }) => {
        const currentItem = await ctx.prisma.category.findUniqueOrThrow({
            include: { items: true },
            where: { id_userId: { id: input.id, userId: ctx.session.user.id } },
        });
        const promiseList = [];
        const transactions: PrismaPromise<unknown>[] = [];
        const imagePaths: string[] = [];

        currentItem.items?.forEach((item) => {
            if (item.imageId) {
                imagePaths.push(item.imageId);
            }
        });

        // Delete category image if exists
        if (currentItem.imageUrl) {
            try {
                await imageKit.deleteFile(currentItem.imageUrl);
            } catch (error) {
                console.error("Failed to delete category image:", error);
            }
        }

        transactions.push(ctx.prisma.menuItem.deleteMany({ where: { categoryId: input.id } }));

        transactions.push(
            ctx.prisma.category.delete({ where: { id_userId: { id: input.id, userId: ctx.session.user.id } } })
        );

        if (imagePaths.length > 0) {
            promiseList.push(imageKit.bulkDeleteFiles(imagePaths));
            transactions.push(ctx.prisma.image.deleteMany({ where: { id: { in: imagePaths } } }));
        }

        await Promise.all([ctx.prisma.$transaction(transactions), promiseList]);

        return currentItem;
    }),

    /** Get all categories belonging to a restaurant menu along with the items and images related to it. */
    getAll: protectedProcedure.input(menuId).query(({ ctx, input }) =>
        ctx.prisma.category.findMany({
            include: { items: { include: { image: true }, orderBy: { position: "asc" } } },
            orderBy: { position: "asc" },
            where: { menuId: input.menuId, userId: ctx.session.user.id },
        })
    ),

    /** Update the details of a menu category */
    update: protectedProcedure.input(categoryInput.merge(id)).mutation(async ({ ctx, input }) => {
        const currentItem = await ctx.prisma.category.findUniqueOrThrow({
            where: { id_userId: { id: input.id, userId: ctx.session.user.id } },
        });

        const updateData: { name: string; imageUrl?: string } = { name: input.name };

        // Handle image upload/replacement
        if (input.imageBase64) {
            // Delete old image if exists
            if (currentItem.imageUrl) {
                try {
                    await imageKit.deleteFile(currentItem.imageUrl);
                } catch (error) {
                    console.error("Failed to delete old category image:", error);
                }
            }

            const [uploadedResponse] = await Promise.all([
                uploadImage(input.imageBase64, `user/${ctx.session.user.id}/category`),
            ]);
            updateData.imageUrl = uploadedResponse.filePath;
        }

        return ctx.prisma.category.update({
            data: updateData,
            where: { id_userId: { id: input.id, userId: ctx.session.user.id } },
        });
    }),

    /** Update the position of the categories within a restaurant menu */
    updatePosition: protectedProcedure
        .input(z.array(id.extend({ newPosition: z.number() })))
        .mutation(async ({ ctx, input }) =>
            ctx.prisma.$transaction(
                input.map((item) =>
                    ctx.prisma.category.update({
                        data: { position: item.newPosition },
                        include: { items: { include: { image: true } } },
                        where: { id_userId: { id: item.id, userId: ctx.session.user.id } },
                    })
                )
            )
        ),
});
