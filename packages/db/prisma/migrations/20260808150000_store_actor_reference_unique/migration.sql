ALTER TABLE `StoreActor`
    ADD CONSTRAINT `StoreActor_username_actorName_key` UNIQUE (`username`, `actorName`);
