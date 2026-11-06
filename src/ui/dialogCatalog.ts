import type { DialogChain } from "./textCard";

export const dialogCatalog: DialogChain[] = [

    {
        dialogIdentifier: "shop_dialog_1",
        cards: [
            {
                text: "I must get out of here as soon as possible.",
                type: "BLOCKING",
            },
            {
                text: "The streets are too dangerous. I should get more weapons before I move out.",
                type: "BLOCKING",
            },
            {
                text: "Click the weapons tab in the left panel. Select a weapon and place it in the vehicle by pressing the left mouse button",
                type: "TUTORIAL",
                specialIdentifier: "gun_place_tutorial",
            },
            {
                text: "Good. All weapons need power to function. I should install a generator and a battery to power my vehicle.",
                type: "BLOCKING",
            },
            {
                text: "Click the utility tab and place a generator and a battery",
                type: "TUTORIAL",
                specialIdentifier: "power_place_tutorial",
            },
            {
                text: "That should be enough. Generators and batteries can explode if destroyed. I should be careful about where I place them.",
                type: "BLOCKING",
            },
            {
                text: "Press the GO button to move out.",
                type: "TUTORIAL",
                specialIdentifier: "go_tutorial",
            }
        ]
    },


    {
        dialogIdentifier: "combat_tutorial",
        cards: [
            {
                text: "The enemy tank is blocking the road ahead. I need to destroy it to move forward.",
                type: "BLOCKING",
            },
            {
                text: "Select the gun in the left panel (press 1) and fire it at the enemy tank using the left mouse button",
                type: "TUTORIAL",
                specialIdentifier: "shooting_tutorial_1",
            },
        ]
    }


]